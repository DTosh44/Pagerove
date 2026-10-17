import type { EnrichedBook, RecognizedBook } from '../../src/domain/ingestion';
import type { RecognitionImage } from '../../src/providers/interfaces';
import { ApiError, id, Repository } from '../repository';
import { deduplicateEnriched, enrich } from './matching';
import { ProviderError, providers, type ProviderConfig } from './providers';
export const limits = {
  images: 3,
  imageBytes: 8 * 1024 * 1024,
  requestBytes: 25 * 1024 * 1024,
  candidates: 60,
};
export function log(event: string, data: Record<string, string | number> = {}) {
  console.info(JSON.stringify({ event, ...data }));
}
export async function rateLimit(
  repo: Repository,
  householdId: string,
  operation: 'scan' | 'lookup',
  config: ProviderConfig,
) {
  if (
    config.INGESTION_RATE_LIMIT &&
    !(await config.INGESTION_RATE_LIMIT.limit({ key: `${householdId}:${operation}` })).success
  )
    throw new ApiError(429, 'Please wait before trying again.');
  const window = Math.floor(Date.now() / 3600000),
    max = operation === 'scan' ? 10 : 120;
  await repo.db
    .prepare('DELETE FROM ingestion_rate_windows WHERE window<?')
    .bind(window - 24)
    .run();
  // Atomic increment with RETURNING; concurrent requests cannot all pass a read-before-write check.
  const row = await repo.db
    .prepare(
      'INSERT INTO ingestion_rate_windows(household_id,operation,window,count) VALUES (?,?,?,1) ON CONFLICT(household_id,operation,window) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(householdId, operation, window)
    .first<{ count: number }>();
  if (!row || row.count > max)
    throw new ApiError(429, 'Hourly book capture limit reached. Please try later.');
}
export async function uploadImages(request: Request): Promise<RecognitionImage[]> {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
    throw new ApiError(415, 'Upload photos as multipart form data.');
  if (Number(request.headers.get('content-length')) > limits.requestBytes)
    throw new ApiError(413, 'Upload is too large.');
  // Bound the stream even when Content-Length is absent or forged, before form parsing.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Choose a photo.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limits.requestBytes) {
        await reader.cancel();
        throw new ApiError(413, 'Upload is too large.');
      }
      chunks.push(part.value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Photo upload failed. Please choose your photos again.');
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let form: FormData;
  try {
    form = await new Response(bytes, {
      headers: { 'Content-Type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    throw new ApiError(400, 'Photo upload failed.');
  }
  const files = form.getAll('photos');
  if (!files.length || files.length > limits.images)
    throw new ApiError(400, 'Choose one to three photos.');
  const images: RecognitionImage[] = [];
  for (const file of files) {
    if (typeof file === 'string' || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new ApiError(415, 'Use JPEG, PNG or WebP photos.');
    if (!file.size || file.size > limits.imageBytes)
      throw new ApiError(413, 'Each photo must be between 1 byte and 8 MB.');
    const data = new Uint8Array(await file.arrayBuffer());
    const png = data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71;
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    const webp =
      new TextDecoder().decode(data.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(data.slice(8, 12)) === 'WEBP';
    if (!(file.type === 'image/png' ? png : file.type === 'image/jpeg' ? jpeg : webp))
      throw new ApiError(415, 'Photo contents do not match the image type.');
    images.push({ id: id(), mimeType: file.type, bytes: data });
  }
  return images;
}
export async function createScan(
  repo: Repository,
  householdId: string,
  images: RecognitionImage[],
  config: ProviderConfig,
) {
  const adapter = providers(config); // Fail configuration before a charge or session is made.
  const scanId = id();
  await repo.db.batch([
    repo.db
      .prepare(
        "INSERT INTO scan_sessions(id,household_id,status,provider,processing_state,processing_started_at) VALUES (?,?,'review',?,'processing',CURRENT_TIMESTAMP)",
      )
      .bind(scanId, householdId, adapter.recognition.name),
    ...images.map((image, index) =>
      repo.db
        .prepare(
          'INSERT INTO scan_images(id,household_id,scan_session_id,filename,mime_type,size_bytes) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          image.id,
          householdId,
          scanId,
          `photo-${index + 1}`,
          image.mimeType,
          image.bytes.length,
        ),
    ),
  ]);
  return scanId;
}
export async function processScan(
  repo: Repository,
  householdId: string,
  scanId: string,
  images: RecognitionImage[],
  config: ProviderConfig,
) {
  const adapter = providers(config),
    warnings: string[] = [];
  log('scan_started', { scanId, images: images.length, provider: adapter.recognition.name });
  const before = await repo.scan(householdId, scanId);
  const existing: EnrichedBook[] = before.candidates.map((candidate) => ({
    ...candidate,
    rawConfidence: candidate.rawConfidence ?? candidate.confidence,
  }));
  let total = existing.length;
  // Across all photos, bound time spent scheduling metadata enrichment.
  let metadataBudget = 60000;
  for (const image of images) {
    await repo.db
      .prepare(
        "UPDATE scan_images SET processing_state='processing',error=NULL WHERE id=? AND household_id=?",
      )
      .bind(image.id, householdId)
      .run();
    try {
      const recognized: RecognizedBook[] = await adapter.recognition.recognize(image);
      log('recognition_count', { scanId, count: recognized.length });
      const unique = deduplicateEnriched([
        ...existing,
        ...recognized.map((book) => ({
          ...book,
          rawConfidence: book.confidence,
          band: 'LOW' as const,
          alternatives: [],
          metadata: null,
          sourceImageIds: [book.sourceImageId],
        })),
      ]);
      const newBooks = unique
        .filter((book) => !existing.includes(book))
        .slice(0, Math.max(0, limits.candidates - total));
      if (recognized.length && newBooks.length < unique.length - existing.length)
        warnings.push('Scan limited to 60 books. Capture a smaller shelf section next time.');
      const startedMatching = Date.now();
      const deadline = startedMatching + metadataBudget;
      // Small worker pool bounds metadata fan-out. The shared time budget falls back to manual review.
      const enriched: EnrichedBook[] = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, newBooks.length) }, async () => {
          for (;;) {
            const index = next++;
            if (index >= newBooks.length) break;
            const book = newBooks[index];
            if (Date.now() > deadline)
              enriched[index] = {
                ...book,
                confidence: 0.35,
                warning: 'Metadata time budget reached. Search or enter details.',
              };
            else enriched[index] = await enrich(book, adapter.metadata);
            if (enriched[index].warning) log('metadata_match_failure', { scanId });
          }
        }),
      );
      metadataBudget = Math.max(0, metadataBudget - (Date.now() - startedMatching));
      for (const book of enriched) {
        // Catalog identity can resolve OCR variants that raw text alone could not group.
        const overlap = existing.find((item) => deduplicateEnriched([item, book]).length === 1);
        if (overlap) {
          overlap.sourceImageIds = [
            ...new Set([...overlap.sourceImageIds, ...book.sourceImageIds]),
          ];
          continue;
        }

        await repo.db
          .prepare(
            'INSERT INTO recognition_candidates(id,household_id,scan_session_id,source_image_id,probable_title,probable_author,probable_isbn,confidence,raw_confidence,enrichment_json) VALUES (?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            id(),
            householdId,
            scanId,
            book.sourceImageId,
            book.probableTitle,
            book.probableAuthor,
            book.probableIsbn,
            book.confidence,
            book.rawConfidence,
            JSON.stringify({
              band: book.band,
              metadata: book.metadata,
              alternatives: book.alternatives,
              sourceImageIds: book.sourceImageIds,
              region: book.region,
              warning: book.warning,
            }),
          )
          .run();
        existing.push(book);
        total++;
      }
      // Merge provenance for overlaps with candidates persisted on earlier images/retries.
      const saved = await repo.scan(householdId, scanId);
      for (const candidate of saved.candidates) {
        const match = existing.find(
          (book) =>
            book.sourceImageId === candidate.sourceImageId &&
            book.probableTitle === candidate.probableTitle,
        );
        if (match)
          await repo.db
            .prepare(
              'UPDATE recognition_candidates SET enrichment_json=? WHERE id=? AND household_id=?',
            )
            .bind(
              JSON.stringify({
                band: candidate.band,
                metadata: candidate.metadata,
                alternatives: candidate.alternatives,
                sourceImageIds: match.sourceImageIds,
                region: candidate.region,
                warning: candidate.warning,
              }),
              candidate.id,
              householdId,
            )
            .run();
      }
      await repo.db
        .prepare(
          "UPDATE scan_images SET processing_state='completed',error=NULL WHERE id=? AND household_id=?",
        )
        .bind(image.id, householdId)
        .run();
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'unavailable';
      log('provider_failure', { scanId, provider: adapter.recognition.name, code });
      const message = `A photo could not be read (${code.replace('_', ' ')}). Re-upload it or add books manually.`;
      warnings.push(message);
      await repo.db
        .prepare(
          "UPDATE scan_images SET processing_state='failed',error=? WHERE id=? AND household_id=?",
        )
        .bind(message, image.id, householdId)
        .run();
    }
  }
  const scan = await repo.scan(householdId, scanId),
    failed = scan.images.some((image) => image.state === 'failed');
  if (!scan.candidates.length && !failed)
    warnings.push('No readable books found. Try a closer, well-lit photo or add a book manually.');
  const state =
    failed && !scan.candidates.length
      ? 'failed'
      : scan.candidates.length &&
          scan.candidates.every((candidate) => candidate.confirmationState !== 'pending')
        ? 'completed'
        : 'review';
  await repo.db
    .prepare(
      'UPDATE scan_sessions SET processing_state=?,warnings_json=? WHERE id=? AND household_id=?',
    )
    .bind(state, JSON.stringify(warnings), scanId, householdId)
    .run();
  log('scan_completed', {
    scanId,
    count: scan.candidates.length,
    confident: scan.candidates.filter((candidate) => candidate.band === 'HIGH').length,
    review: scan.candidates.filter((candidate) => candidate.band !== 'HIGH').length,
  });
}
