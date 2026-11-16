import { z } from 'zod';
import { ORDER_STATUSES } from './orders.ts';

const SCRIPT_TAG_OR_XSS = /<\s*script|javascript:|onerror\s*=|onload\s*=|<\s*iframe/i;

export function sanitizeText(value: string): string {
  return value.trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

const safeString = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .transform(sanitizeText)
    .refine((val) => val.length >= min, `${label} must be at least ${min} characters.`)
    .refine((val) => val.length <= max, `${label} must be at most ${max} characters.`)
    .refine((val) => !SCRIPT_TAG_OR_XSS.test(val), `${label} contains prohibited characters.`);

export const registerSchema = z.object({
  name: safeString(2, 100, 'Full name'),
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address.')
    .max(254, 'Email address is too long.'),
  password: z
    .string({ error: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be at most 128 characters.')
    .refine((val) => /[A-Za-z]/.test(val) && /[0-9]/.test(val), {
      message: 'Password must contain at least one letter and one number.',
    }),
  phone: safeString(0, 30, 'Phone number').optional().default(''),
  defaultAddress: safeString(0, 250, 'Default address').optional().default(''),
});

export const loginSchema = z.object({
  email: z
    .string({ error: 'Email is required.' })
    .trim()
    .toLowerCase()
    .email('Please provide a valid email address.')
    .max(254),
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(128),
});

export const profileUpdateSchema = z.object({
  name: safeString(2, 100, 'Full name'),
  phone: safeString(0, 30, 'Phone number').optional().default(''),
  defaultAddress: safeString(0, 250, 'Default address').optional().default(''),
});

export const categorySchema = z.object({
  name: safeString(2, 60, 'Category name'),
  description: safeString(0, 220, 'Description').optional().default(''),
  sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
});

export const menuItemSchema = z.object({
  categoryId: z.coerce.number().int().positive('Please select a valid category.'),
  name: safeString(2, 100, 'Dish name'),
  description: safeString(10, 500, 'Description'),
  priceCents: z.coerce
    .number()
    .int('Price must be a whole number of kobo.')
    .min(50, 'Price must be at least ₦0.50.')
    .max(500000000, 'Price cannot exceed ₦5,000,000.00.'),
  imageUrl: z
    .string({ error: 'Image URL is required.' })
    .trim()
    .min(1, 'Image URL is required.')
    .max(500)
    .refine(
      (url) => url.startsWith('/src/assets/') || url.startsWith('/assets/') || url.startsWith('https://'),
      'Image URL must be a valid local asset path or HTTPS URL.'
    ),
  dietaryTags: z
    .array(safeString(1, 30, 'Dietary tag'))
    .max(6, 'At most 6 dietary tags allowed.')
    .optional()
    .default([]),
  prepTimeMins: z.coerce.number().int().min(1).max(180).optional().default(15),
  isAvailable: z.boolean().optional().default(true),
  stockQuantity: z.coerce
    .number()
    .int('Stock quantity must be a whole number.')
    .min(0, 'Stock quantity cannot be negative.')
    .max(9999, 'Stock quantity cannot exceed 9,999.')
    .optional()
    .default(25),
  isFeatured: z.boolean().optional().default(false),
});

export const createOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          menuItemId: z.coerce.number().int().positive('Invalid menu item ID.'),
          quantity: z.coerce
            .number()
            .int('Quantity must be a whole number.')
            .min(1, 'Quantity must be at least 1.')
            .max(50, 'Maximum quantity per item is 50.'),
        })
      )
      .min(1, 'Your order must include at least one item.')
      .max(40, 'Order cannot contain more than 40 distinct items.'),
    customerName: safeString(2, 100, 'Contact name'),
    customerEmail: z
      .string({ error: 'Contact email is required.' })
      .trim()
      .toLowerCase()
      .email('Please provide a valid contact email.')
      .max(254),
    customerPhone: safeString(7, 30, 'Contact phone'),
    fulfillmentType: z.enum(['DELIVERY', 'COLLECTION']),
    deliveryAddress: safeString(0, 300, 'Delivery address').optional().default(''),
    orderNotes: safeString(0, 400, 'Order notes').optional().default(''),
    paymentMethod: z.enum(['PAYSTACK', 'PAY_ON_COLLECTION']),
    paymentReference: safeString(0, 120, 'Payment reference').optional().default(''),
    paymentVerificationToken: z
      .string()
      .trim()
      .max(1024, 'Payment verification token is too long.')
      .optional()
      .default(''),
  })
  .superRefine((val, ctx) => {
    if (val.fulfillmentType === 'DELIVERY' && val.deliveryAddress.trim().length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'Please enter a complete delivery address for delivery orders.',
      });
    }
    if (val.fulfillmentType === 'DELIVERY' && val.paymentMethod === 'PAY_ON_COLLECTION') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paymentMethod'],
        message: 'Pay on collection is only available for collection orders.',
      });
    }
    if (val.paymentMethod === 'PAYSTACK') {
      if (!val.paymentReference || val.paymentReference.trim().length < 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentReference'],
          message: 'A valid Paystack payment reference is required.',
        });
      }
      if (!val.paymentVerificationToken || val.paymentVerificationToken.trim().length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentVerificationToken'],
          message: 'A valid server-issued payment verification token is required.',
        });
      }
    }
  });

export const paystackVerifySchema = z.object({
  reference: z
    .string({ error: 'Payment reference is required.' })
    .trim()
    .min(6, 'Invalid payment reference.')
    .max(120, 'Payment reference is too long.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid payment reference format.'),
  verificationToken: z
    .string({ error: 'Verification token is required.' })
    .trim()
    .min(16, 'Invalid payment verification token.')
    .max(1024, 'Payment verification token is too long.'),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});
