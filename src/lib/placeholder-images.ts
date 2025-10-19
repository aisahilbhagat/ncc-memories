import data from './placeholder-images.json';

// Extend the type to include dimensions and orientation for layout handling.
export type ImagePlaceholder = {
  id: string;
  description: string;
  imageUrl: string;
  imageHint: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
};

// Assert the type of the imported data to match our extended ImagePlaceholder type.
export const AllImages: ImagePlaceholder[] = data.placeholderImages as ImagePlaceholder[];

// Create a pre-filtered list of portrait images for convenience.
export const PortraitImages: ImagePlaceholder[] = AllImages.filter(
  (img) => img.orientation === 'portrait'
);

// Create a pre-filtered list of landscape images.
export const LandscapeImages: ImagePlaceholder[] = AllImages.filter(
  (img) => img.orientation === 'landscape'
);
