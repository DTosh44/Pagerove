import { ZodError, type ZodType } from 'zod';
import {
  bookInput,
  candidateInput,
  historyInput,
  householdInput,
  memberInput,
  recommendationInput,
  scanInput,
} from '../src/domain/validation';
import { eligibleBooks, guardRecommendations } from '../src/domain/library';
import { deterministicRecommendations, mockRecognitionProvider } from '../src/providers/mock';
import { ApiError, id, Repository } from './repository';
export interface Env {
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
  async fetch(request: Request, env: Env): Promise<Response> {
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
      if (request.method === 'POST' && url.pathname === '/api/books')
        return json(await repo.addBook(household.id, await body(request, bookInput)), 201);
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
        const input = await body(request, scanInput);
        const scanId = id(),
          imageId = id();
        const candidates = await mockRecognitionProvider.recognize({
          id: imageId,
          filename: input.filename,
        });
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO scan_sessions(id,household_id,status,provider) VALUES (?,?,'review',?)",
          ).bind(scanId, household.id, mockRecognitionProvider.name),
          env.DB.prepare(
            'INSERT INTO scan_images(id,household_id,scan_session_id,filename,mime_type,size_bytes) VALUES (?,?,?,?,?,?)',
          ).bind(imageId, household.id, scanId, input.filename, input.mimeType, input.sizeBytes),
          ...candidates.map((candidate) =>
            env.DB.prepare(
              'INSERT INTO recognition_candidates(id,household_id,scan_session_id,source_image_id,probable_title,probable_author,probable_isbn,confidence) VALUES (?,?,?,?,?,?,?,?)',
            ).bind(
              id(),
              household.id,
              scanId,
              imageId,
              candidate.probableTitle,
              candidate.probableAuthor,
              candidate.probableIsbn,
              candidate.confidence,
            ),
          ),
        ]);
        return json(await repo.scan(household.id, scanId), 201);
      }
      const scanRoute = url.pathname.match(/^\/api\/scans\/([^/]+)$/);
      if (request.method === 'GET' && scanRoute)
        return json(await repo.scan(household.id, scanRoute[1]));
      const candidateRoute = url.pathname.match(/^\/api\/scans\/([^/]+)\/candidates\/([^/]+)$/);
      if (request.method === 'PUT' && candidateRoute) {
        const input = await body(request, candidateInput);
        return json(
          await repo.confirmCandidate(
            household.id,
            candidateRoute[1],
            candidateRoute[2],
            input.action,
            input.title,
            input.author,
          ),
        );
      }
      throw new ApiError(404, 'API route not found.');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error('PageRove API failure', error);
      return json({ error: 'We could not save that change. Please try again.' }, 500);
    }
  },
};
