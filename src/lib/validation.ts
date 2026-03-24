import { z } from "zod";

// Server-side validation for the onboarding movie input.
// We keep the bounds explicit for correctness and predictable storage.
export const favoriteMovieSchema = z
  .string()
  .trim()
  .min(1, "Please enter your favorite movie.")
  .max(120, "Movie title is too long (max 120 characters).");

