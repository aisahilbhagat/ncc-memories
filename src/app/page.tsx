import { MemoryGallery } from '@/components/memory-gallery';
import { ImageCacher } from '@/components/image-cacher';
import { AllImages, PortraitImages } from '@/lib/placeholder-images';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Memory Lane',
  description: 'A nostalgic journey through your memories.',
};

// This function shuffles an array and returns a new shuffled array.
// This ensures a random order for the images in the gallery.
const getShuffledArray = <T,>(arr: T[]): T[] => {
  return [...arr].sort(() => Math.random() - 0.5);
};

export default function Home() {
  // Get a random portrait image for the initial blurred background on the landing page.
  const initialBgImage = PortraitImages.length > 0 
    ? PortraitImages[Math.floor(Math.random() * PortraitImages.length)]
    : AllImages[0];
  
  // Shuffle all images to provide a random initial order for the gallery.
  const shuffledImages = getShuffledArray(AllImages);

  return (
    <main className="font-body bg-background">
      <ImageCacher images={AllImages} />
      <MemoryGallery allImages={shuffledImages} initialBgImage={initialBgImage} />
    </main>
  );
}
