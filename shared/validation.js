import { z } from 'zod';

/**
 * Zod validation schema for 10-digit mobile numbers.
 */
export const phoneSchema = (label = 'Mobile number', required = false) => {
  let s = z.string().trim();
  if (required) {
    s = s.min(1, `${label} is required`);
  } else {
    s = s.optional().or(z.literal(''));
  }
  return s.refine(
    (val) => {
      if (!val || val === '') return !required;
      const digits = String(val).replace(/\D/g, '');
      return digits.length === 10;
    },
    { message: `${label} must be exactly 10 digits` }
  );
};

/**
 * Zod validation schema for email addresses.
 */
export const emailSchema = (label = 'Customer email', required = false) => {
  let s = z.string().trim();
  if (required) {
    s = s.min(1, `${label} is required`);
  } else {
    s = s.optional().or(z.literal(''));
  }
  return s.refine(
    (val) => {
      if (!val || val === '') return !required;
      return z.string().email().safeParse(val).success;
    },
    { message: `${label} must be a valid email address` }
  );
};

/**
 * Build dynamic Zod schema for a list of field definitions.
 */
export function buildZodSchema(fields) {
  const shape = {};
  for (const f of fields) {
    if (f.formula || f.system || f.hidden) continue;
    const isPhone = f.type === 'phone' || f.key.toLowerCase().includes('phone');
    const isEmail = f.type === 'email' || f.key.toLowerCase().includes('email');
    if (isPhone) {
      shape[f.key] = phoneSchema(f.label, !!f.required);
    } else if (isEmail) {
      shape[f.key] = emailSchema(f.label, !!f.required);
    } else if (f.type === 'number' || f.type === 'currency') {
      const numS = z.union([z.number(), z.string()]).optional().or(z.literal(''));
      shape[f.key] = numS.refine(
        (v) => {
          if (v == null || v === '') return !f.required;
          const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
          if (!Number.isFinite(n)) return false;
          if (f.min != null && n < Number(f.min)) return false;
          if (f.max != null && n > Number(f.max)) return false;
          return true;
        },
        {
          message:
            f.min != null && f.max != null
              ? `${f.label} must be between ${f.min} and ${f.max}`
              : f.min != null
              ? `${f.label} must be at least ${f.min}`
              : `${f.label} must be a valid number`,
        }
      );
    } else if (f.type === 'select') {
      let selS = z.string().optional().or(z.literal(''));
      if (f.required) {
        selS = z.string().trim().min(1, `${f.label} is required`);
      }
      shape[f.key] = selS.refine(
        (v) => {
          if (!v || v === '') return !f.required;
          return (f.options || []).map(String).includes(String(v));
        },
        { message: `${f.label} must be one of: ${(f.options || []).join(', ')}` }
      );
    } else {
      if (f.required) {
        shape[f.key] = z.string().trim().min(1, `${f.label} is required`);
      } else {
        shape[f.key] = z.any().optional();
      }
    }
  }
  return z.object(shape);
}

/**
 * Validates arbitrary form values against field definitions using Zod.
 * Returns { valid: boolean, errors: Record<string, string>, data?: any }
 */
export function validateWithZod(fields, values) {
  const schema = buildZodSchema(fields);
  const result = schema.safeParse(values || {});
  if (!result.success) {
    const errors = {};
    for (const issue of result.error.issues) {
      const fieldKey = issue.path[0];
      if (fieldKey && !errors[fieldKey]) {
        errors[fieldKey] = issue.message;
      }
    }
    return { valid: false, errors };
  }
  return { valid: true, data: result.data };
}
