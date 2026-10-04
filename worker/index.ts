import { ZodError, type ZodType } from 'zod';
import {
  bookInput,
  candidateInput,
  historyInput,
  householdInput,
  memberInput,
  recommendationInput,
  scanInput,
  lookupInput,
} from '../src/domain/validation';
import { eligibleBooks, guardRecommendations } from '../src/domain/library';
import { deterministicRecommendations } from '../src/providers/mock';
import { ApiError, id, Repository } from './repository';
import { providers, ProviderError, type ProviderConfig } from './ingestion/providers';
import { createScan, processScan, uploadImages, rateLimit } from './ingestion/scans';
import { matchBook } from './ingestion/matching';
export interface Env extends ProviderConfig {
  DB: D1Database;
  APP_MODE: string;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
async function body<T>(request: Request, schema: ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApiError(415, 'Send JSON.');
  const text = await request.text();
  if (text.length > 32768) throw new ApiError(413, 'Request is too large.');
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof ZodError)
      throw new ApiError(400, error.issues.map((issue) => issue.message).join(' '));
    throw new ApiError(400, 'Invalid JSON.');
  }
}
export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    try {
      if (env.APP_MODE !== 'demo')
        throw new ApiError(
          503,
          'Private access is not configured. Enable an authenticated identity adapter before production use.',
        );
      if (request.method !== 'GET') {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin)
          throw new ApiError(403, 'Cross-origin writes are not allowed.');
      }
      // Deliberately fixed public demo identity. Production is fail-closed above.
      const repo = new Repository(env.DB, 'user-demo');
      const household = await repo.household();
      if (request.method === 'GET' && url.pathname === '/api/state')
        return json(await repo.state(household));
      if (request.method === 'POST' && url.pathname === '/api/households') {
        const input = await body(request, householdInput);
        return json(await repo.createHousehold(input.name, input.displayName), 201);
      }
      if (!household) throw new ApiError(409, 'Create your household first.');
      if (request.method === 'POST' && url.pathname === '/api/members')
        return json(await repo.addMember(household.id, await body(request, memberInput)), 201);
      if (request.method === 'POST' && url.pathname === '/api/books') {
        const input = await body(request, bookInput);
        await rateLimit(repo, household.id, 'lookup', env);
        let metadata = null;
        try {
          const matches = await matchBook(input, providers(env).metadata);
          metadata = input.metadataId
            ? (matches.find((match) => match.metadata.id === input.metadataId)?.metadata ?? null)
            : matches[0]?.band === 'HIGH'
              ? matches[0].metadata
              : null;
          if (input.metadataId && !metadata)
            throw new ApiError(
              400,
              'That metadata match is unavailable. Search again or clear your selection.',
            );
        } catch (error) {
          if (
            error instanceof ApiError ||
            (error instanceof ProviderError && error.code === 'configuration')
          )
            throw error;
        }
        return json(await repo.addBook(household.id, input, metadata), 201);
      }
      if (request.method === 'POST' && url.pathname === '/api/metadata/lookup') {
        await rateLimit(repo, household.id, 'lookup', env);
        const input = await body(request, lookupInput);
        try {
          return json({ matches: await matchBook(input, providers(env).metadata) });
        } catch (error) {
          if (error instanceof ProviderError) throw error;
          throw new ApiError(400, 'Enter a valid ISBN-10 or ISBN-13.');
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/ingestion/config') {
        const adapter = providers(env);
        return json({
          recognition: adapter.recognition.name,
          metadata: adapter.metadata.name,
          externalImages: adapter.recognition.name !== 'mock',
        });
      }
      if (request.method === 'PUT' && url.pathname === '/api/history') {
        await repo.saveHistory(household.id, await body(request, historyInput));
        return json({ saved: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/recommendations') {
        const input = await body(request, recommendationInput);
        const state = await repo.state(household);
        const member = state.members.find((item) => item.id === input.memberId);
        if (!member) throw new ApiError(404, 'Reading profile not found.');
        const eligible = eligibleBooks(state.books, member.id);
        const recommendations = guardRecommendations(
          await deterministicRecommendations.recommend({
            books: eligible,
            member,
            request: input.request,
          }),
          eligible,
        );
        const sessionId = id();
        await env.DB.batch([
          env.DB.prepare(
            'INSERT INTO recommendation_sessions(id,household_id,member_id,request,provider) VALUES (?,?,?,?,?)',
          ).bind(
            sessionId,
            household.id,
            member.id,
            input.request,
            deterministicRecommendations.name,
          ),
          ...recommendations.map((recommendation, index) =>
            env.DB.prepare(
              'INSERT INTO recommendations(id,household_id,session_id,household_book_id,explanation,rank) VALUES (?,?,?,?,?,?)',
            ).bind(
              id(),
              household.id,
              sessionId,
              recommendation.bookId,
              recommendation.explanation,
              index + 1,
            ),
          ),
        ]);
        return json({ id: sessionId, recommendations });
      }
      if (request.method === 'POST' && url.pathname === '/api/scans') {
        await rateLimit(repo, household.id, 'scan', env);
        let images;
        // Compatibility with old local mock clients. Real providers always require actual image bytes.
        if (
          request.headers.get('content-type')?.startsWith('application/json') &&
          (env.BOOK_RECOGNITION_PROVIDER ?? 'mock') === 'mock'
        ) {
          const input = await body(request, scanInput);
          images = [{ id: id(), mimeType: input.mimeType, bytes: new Uint8Array(input.sizeBytes) }];
        } else images = await uploadImages(request);
        const scanId = await createScan(repo, household.id, images, env);
        const job = processScan(repo, household.id, scanId, images, env).catch(async () => {
          await env.DB.prepare(
            "UPDATE scan_sessions SET processing_state='failed',warnings_json=? WHERE id=? AND household_id=?",
          )
            .bind(
              JSON.stringify(['Processing was interrupted. Re-upload a photo to resume.']),
              scanId,
              household.id,
            )
            .run();
        });
        if (
          ctx &&
          (env.BOOK_RECOGNITION_PROVIDER ?? 'mock') === 'mock' &&
          (env.BOOK_METADATA_PROVIDER ?? 'mock') === 'mock'
        )
          ctx.waitUntil(job);
        else await job;
        return json(await repo.scan(household.id, scanId), 201);
      }
      const retryRoute = url.pathname.match(/^\/api\/scans\/([^/]+)\/images\/([^/]+)\/retry$/);
      if (request.method === 'POST' && retryRoute) {
        const scan = await repo.scan(household.id, retryRoute[1]);
        const image = scan.images.find((image) => image.id === retryRoute[2]);
        if (!image) throw new ApiError(404, 'Photo not found.');
        if (scan.status === 'processing')
          throw new ApiError(409, 'This scan is still processing. Try again shortly.');
        if (!['failed', 'pending', 'processing'].includes(image.state))
          throw new ApiError(409, 'This photo has already been processed.');
        await rateLimit(repo, household.id, 'scan', env);
        providers(env);
        const images = await uploadImages(request);
        if (images.length !== 1) throw new ApiError(400, 'Re-upload one photo at a time.');
        images[0].id = image.id;
        const claim = await env.DB.prepare(
          "UPDATE scan_sessions SET processing_state='processing',processing_started_at=CURRENT_TIMESTAMP WHERE id=? AND household_id=? AND processing_state!='processing'",
        )
          .bind(scan.id, household.id)
          .run();
        if (!claim.meta.changes) throw new ApiError(409, 'This scan is already being processed.');
        await env.DB.prepare(
          'UPDATE scan_images SET mime_type=?,size_bytes=? WHERE id=? AND household_id=? AND scan_session_id=?',
        )
          .bind(images[0].mimeType, images[0].bytes.length, image.id, household.id, scan.id)
          .run();
        const job = processScan(repo, household.id, scan.id, images, env).catch(async () => {
          await env.DB.prepare(
            "UPDATE scan_sessions SET processing_state='failed' WHERE id=? AND household_id=?",
          )
            .bind(scan.id, household.id)
            .run();
        });
        if (
          ctx &&
          (env.BOOK_RECOGNITION_PROVIDER ?? 'mock') === 'mock' &&
          (env.BOOK_METADATA_PROVIDER ?? 'mock') === 'mock'
        )
          ctx.waitUntil(job);
        else await job;
        return json(await repo.scan(household.id, scan.id));
      }
      const bulkRoute = url.pathname.match(/^\/api\/scans\/([^/]+)\/accept-confident$/);
      if (request.method === 'POST' && bulkRoute)
        return json(await repo.bulkAccept(household.id, bulkRoute[1]));
      const searchRoute = url.pathname.match(
        /^\/api\/scans\/([^/]+)\/candidates\/([^/]+)\/search$/,
      );
      if (request.method === 'POST' && searchRoute) {
        const scan = await repo.scan(household.id, searchRoute[1]);
        const candidate = scan.candidates.find((candidate) => candidate.id === searchRoute[2]);
        if (!candidate) throw new ApiError(404, 'Candidate not found.');
        if (candidate.confirmationState !== 'pending') return json(scan);
        await rateLimit(repo, household.id, 'lookup', env);
        const input = await body(request, lookupInput);
        const alternatives = await matchBook(input, providers(env).metadata);
        await env.DB.prepare(
          "UPDATE recognition_candidates SET enrichment_json=?,confidence=0.35 WHERE id=? AND household_id=? AND confirmation_state='pending'",
        )
          .bind(
            JSON.stringify({
              band: 'LOW',
              metadata: null,
              alternatives,
              sourceImageIds: candidate.sourceImageIds,
              region: candidate.region,
            }),
            candidate.id,
            household.id,
          )
          .run();
        return json(await repo.scan(household.id, scan.id));
      }
      if (request.method === 'GET' && url.pathname === '/api/scans')
        return json(
          (
            await env.DB.prepare(
              'SELECT id,processing_state AS status FROM scan_sessions WHERE household_id=? ORDER BY rowid DESC LIMIT 10',
            )
              .bind(household.id)
              .all()
          ).results,
        );
      const scanRoute = url.pathname.match(/^\/api\/scans\/([^/]+)$/);
      if (request.method === 'GET' && scanRoute)
        return json(await repo.scan(household.id, scanRoute[1]));
      const candidateRoute = url.pathname.match(/^\/api\/scans\/([^/]+)\/candidates\/([^/]+)$/);
      if (request.method === 'PUT' && candidateRoute) {
        const input = await body(request, candidateInput);
        const scan = await repo.scan(household.id, candidateRoute[1]);
        const candidate = scan.candidates.find((candidate) => candidate.id === candidateRoute[2]);
        if (!candidate) throw new ApiError(404, 'Candidate not found.');
        const edited =
          (input.title && input.title !== (candidate.metadata?.title ?? candidate.probableTitle)) ||
          (input.author &&
            input.author !==
              (candidate.metadata?.authors.join(', ') ?? candidate.probableAuthor)) ||
          (input.isbn && input.isbn !== (candidate.metadata?.isbn13 ?? candidate.probableIsbn));
        if (
          input.action === 'accept' &&
          !input.metadataId &&
          edited &&
          candidate.confirmationState === 'pending'
        ) {
          await rateLimit(repo, household.id, 'lookup', env);
          let alternatives: Awaited<ReturnType<typeof matchBook>> = [];
          try {
            alternatives = await matchBook(
              {
                title: input.title ?? candidate.probableTitle,
                author: input.author ?? candidate.probableAuthor,
                isbn: input.isbn || undefined,
              },
              providers(env).metadata,
            );
          } catch {
            /* Manual details remain confirmable if catalog enrichment fails. */
          }
          const best = alternatives[0]?.band === 'HIGH' ? alternatives[0] : null;
          await env.DB.prepare(
            "UPDATE recognition_candidates SET enrichment_json=?,confidence=? WHERE id=? AND household_id=? AND confirmation_state='pending'",
          )
            .bind(
              JSON.stringify({
                band: best?.band ?? 'LOW',
                metadata: best?.metadata ?? null,
                alternatives,
                sourceImageIds: candidate.sourceImageIds,
                region: candidate.region,
              }),
              best?.score ?? 0.35,
              candidate.id,
              household.id,
            )
            .run();
          if (best) input.metadataId = best.metadata.id;
        }
        return json(
          await repo.confirmCandidate(
            household.id,
            candidateRoute[1],
            candidateRoute[2],
            input.action,
            input.title,
            input.author,
            input,
          ),
        );
      }
      throw new ApiError(404, 'API route not found.');
    } catch (error) {
      if (error instanceof ProviderError) {
        console.info(JSON.stringify({ event: 'provider_failure', code: error.code }));
        return json(
          {
            error:
              error.code === 'configuration'
                ? 'Book providers are not configured. Use mock mode or ask your administrator to enable them.'
                : error.message,
          },
          error.code === 'rate_limit' ? 429 : 503,
        );
      }
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error(JSON.stringify({ event: 'api_failure' }));
      return json({ error: 'We could not save that change. Please try again.' }, 500);
    }
  },
};
