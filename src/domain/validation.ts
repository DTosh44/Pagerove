import { z } from 'zod';
import { formats, statuses } from './types';
const name = z.string().trim().min(1).max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a valid calendar date')
  .nullable()
  .optional();
export const householdInput = z.object({ name, displayName: name });
export const memberInput = z.object({
  displayName: name,
  type: z.enum(['adult', 'child']),
  preferences: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});
export const bookInput = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(200),
  format: z.enum(formats).default('paperback'),
  isbn: z.string().trim().max(20).optional(),
  additionalCopy: z.boolean().default(false),
  metadataId: z.string().max(200).optional(),
  categories: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});
export const historyInput = z
  .object({
    memberId: z.string().min(1),
    bookIds: z.array(z.string().min(1)).min(1).max(100),
    status: z.enum(statuses),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    startedDate: date,
    finishedDate: date,
  })
  .refine(
    (data) => !data.startedDate || !data.finishedDate || data.startedDate <= data.finishedDate,
    'Finish date must be on or after start date',
  );
export const recommendationInput = z.object({
  memberId: z.string().min(1),
  request: z.string().trim().max(500).default(''),
});
export const scanInput = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});
export const candidateInput = z.object({
  action: z.enum(['accept', 'reject']),
  title: z.string().trim().min(1).max(200).optional(),
  author: z.string().trim().min(1).max(200).optional(),
  isbn: z.string().trim().max(20).optional(),
  format: z.enum(formats).optional(),
  metadataId: z.string().max(200).optional(),
  additionalCopy: z.boolean().default(false),
});

export const lookupInput = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    author: z.string().trim().max(200).optional(),
    isbn: z.string().trim().max(20).optional(),
  })
  .refine((value) => value.title || value.isbn, 'Enter a title or ISBN.');
