// src/components/memory-gallery.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import anime from 'animejs';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ImagePlaceholder } from '@/lib/placeholder-images';
import { ArrowLeft, ArrowRight, Grid, Image as ImageIcon, X, Expand, Minimize } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getImage } from '@/lib/indexed-db';

// Custom hook to get an image from IndexedDB or fall back to network.
const useOfflineImage = (imageUrl: string | null) => {
  const [source, setSource] = useState<string | null>(imageUrl);

  useEffect(() => {
    if (!imageUrl) return;

    let isMounted = true;
    const fetchImage = async () => {
      const cachedBlob = await getImage(imageUrl);
      if (isMounted) {
        if (cachedBlob) {
          setSource(URL.createObjectURL(cachedBlob));
        } else {
          setSource(imageUrl); // Fallback to network URL
        }
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
      // Revoke object URL to prevent memory leaks if it was created
      if (source && source.startsWith('blob:')) {
        URL.revokeObjectURL(source);
      }
    };
  }, [imageUrl]); // source is intentionally omitted from deps

  return source;
};


// Props for the component, specifying the images it will manage.
interface MemoryGalleryProps {
  allImages: ImagePlaceholder[];
  initialBgImage: ImagePlaceholder;
}

export function MemoryGallery({ allImages, initialBgImage }: MemoryGalleryProps) {
  // State to track which view is active: landing, swipe gallery, or frozen grid.
  const [galleryMode, setGalleryMode] = useState<'landing' | 'swipe' | 'frozen'>('landing');
  // State for the image currently being viewed by the user.
  const [currentImage, setCurrentImage] = useState<ImagePlaceholder | null>(null);
  // State for the next image to be shown, which is preloaded in the background.
  const [nextImage, setNextImage] = useState<ImagePlaceholder | null>(allImages[0]);
  // State for the queue of images that have not yet been seen in the current cycle.
  const [unseenImageQueue, setUnseenImageQueue] = useState<ImagePlaceholder[]>(allImages.slice(1));
  // State to control the visibility of desktop navigation hints.
  const [showHints, setShowHints] = useState(false);
  // State to control the locked (zoomed) view of an image.
  const [isLocked, setIsLocked] = useState(false);
  // State to track fullscreen status
  const [isFullScreen, setIsFullScreen] = useState(false);
  
  // State for first-visit tutorials
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState(false);


  // Hook to detect mobile viewport.
  const isMobile = useIsMobile();

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isAnimating = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panPosition = useRef({ x: 0, y: 0 });
  const didPan = useRef(false); // Track if a pan occurred during a pointer down

  // Use our custom hook to get the right image source (DB or network)
  const currentImageSource = useOfflineImage(currentImage?.imageUrl ?? null);
  const nextImageSource = useOfflineImage(nextImage?.imageUrl ?? null);
  const initialBgSource = useOfflineImage(initialBgImage.imageUrl);
  const bgImageSource = useOfflineImage(galleryMode === 'swipe' && currentImage ? currentImage.imageUrl : initialBgImage.imageUrl);


  // Check for first visit on mount
  useEffect(() => {
    // We need to check this only on the client-side
    const hasVisited = localStorage.getItem('hasVisitedMemoryLane');
    if (!hasVisited) {
      setIsFirstVisit(true);
      // Only show the mobile warning if the user is on mobile
      if (window.innerWidth < 768) {
        setShowMobileWarning(true);
      }
    }
  }, []);


  // Core function to transition to the next image.
  const showNextImage = useCallback(() => {
    if (isAnimating.current || !nextImage || isLocked) return;
    isAnimating.current = true;

    anime({
      targets: imageContainerRef.current,
      opacity: 0,
      scale: 0.98,
      duration: 400,
      easing: 'easeInCubic',
      complete: () => {
        setCurrentImage(nextImage);
        
        let queue = unseenImageQueue;
        if (queue.length === 0) {
          queue = [...allImages].filter(img => img.id !== nextImage.id).sort(() => Math.random() - 0.5);
        }

        const newNextImage = queue[0];
        const newQueue = queue.slice(1);
        setNextImage(newNextImage);
        setUnseenImageQueue(newQueue);

        anime({
          targets: imageContainerRef.current,
          opacity: 1,
          scale: 1,
          duration: 400,
          easing: 'easeOutCubic',
          complete: () => {
            isAnimating.current = false;
          },
        });
      },
    });
  }, [nextImage, unseenImageQueue, allImages, isLocked]);
  
  const handleSwipe = useCallback(() => {
    if (isLocked) return;
    if (isFirstVisit) {
      localStorage.setItem('hasVisitedMemoryLane', 'true');
      setIsFirstVisit(false);
    }
    showNextImage();
  }, [showNextImage, isLocked, isFirstVisit]);

  // Handler to start the gallery from the landing page.
  const startGallery = () => {
    setGalleryMode('swipe');
  };

  const showFrozenGallery = () => {
    setGalleryMode('frozen');
  }

  const handleFrozenImageClick = (image: ImagePlaceholder) => {
    setCurrentImage(image);
    setGalleryMode('swipe');
  }

  const returnToLanding = () => {
    setGalleryMode('landing');
    setCurrentImage(null);
  }
  
  const toggleLock = useCallback(() => {
    if (!currentImage) return;

    if (isFirstVisit) {
      localStorage.setItem('hasVisitedMemoryLane', 'true');
      setIsFirstVisit(false);
    }

    const newIsLocked = !isLocked;
    setIsLocked(newIsLocked);

    // Reset transform on unlock
    if (!newIsLocked && imageRef.current) {
        panPosition.current = { x: 0, y: 0 };
        anime.remove(imageRef.current);
        anime({
            targets: imageRef.current,
            translateX: 0,
            translateY: 0,
            scale: 1,
            duration: 300,
            easing: 'easeOutCubic'
        });
    }
  }, [isLocked, currentImage, isFirstVisit]);

  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, []);

  // This effect runs once the gallery becomes active, triggering the first image transition.
  useEffect(() => {
    if (galleryMode === 'swipe' && !currentImage) {
      showNextImage();
      setShowHints(true);
      const timer = setTimeout(() => setShowHints(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [galleryMode, showNextImage, currentImage]);

  // Panning logic for zoomed-in image
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;
  
    const onPointerDown = (e: PointerEvent) => {
        // We only care about pointer downs on the image itself
        if (e.target !== imageRef.current) return;
        
        e.preventDefault();
        e.stopPropagation();

        didPan.current = false;
        if (isLocked) {
            isPanning.current = true;
            panStart.current = { x: e.clientX - panPosition.current.x, y: e.clientY - panPosition.current.y };
            imageRef.current?.style.setProperty('cursor', 'grabbing');
            anime.remove(imageRef.current);
        }
    };

    const onPointerMove = (e: PointerEvent) => {
        if (!isPanning.current || !isLocked || !imageRef.current) return;
        
        const panThreshold = 5; // To distinguish between click and pan
        const currentPanX = e.clientX - panStart.current.x;
        const currentPanY = e.clientY - panStart.current.y;
        
        if (!didPan.current && (Math.abs(currentPanX - panPosition.current.x) > panThreshold || Math.abs(currentPanY - panPosition.current.y) > panThreshold)) {
            didPan.current = true; // A significant move has occurred
        }

        if (didPan.current) {
            let newX = currentPanX;
            let newY = currentPanY;

            const imageEl = imageRef.current;
            const imageRect = imageEl.getBoundingClientRect();
            
            // The image is scaled by 2, so its display size is bigger
            const scaledWidth = imageRect.width; 
            const scaledHeight = imageRect.height;
            
            // Max travel distance from center (based on the scaled size)
            const maxX = Math.max(0, (scaledWidth - container.clientWidth) / 2);
            const maxY = Math.max(0, (scaledHeight - container.clientHeight) / 2);
            
            newX = Math.max(-maxX, Math.min(maxX, newX));
            newY = Math.max(-maxY, Math.min(maxY, newY));

            panPosition.current = { x: newX, y: newY };
            // Apply transform directly for immediate feedback, dividing by scale factor
            imageEl.style.transform = `scale(2) translateX(${newX / 2}px) translateY(${newY / 2}px)`;
        }
    };

    const onPointerUp = (e: PointerEvent) => {
        // Only trigger on up if it's on the image
        if (e.target !== imageRef.current && !isPanning.current) return;
        e.stopPropagation();

        // If we didn't pan, it was a click, so toggle lock state
        if (!didPan.current) {
            toggleLock();
        }

        isPanning.current = false;
        
        if (imageRef.current) {
            imageRef.current.style.cursor = isLocked ? 'grab' : 'zoom-in';
        }
    };
    
    // We attach down and up to the image itself, but move to the window
    // to allow dragging outside the image bounds.
    const imageElement = imageRef.current;
    imageElement?.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    
    return () => {
        imageElement?.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
    }

  }, [isLocked, toggleLock]);

  // Effect for handling swipe gestures on touch devices.
  useEffect(() => {
    if (galleryMode !== 'swipe' || isLocked) return;

    let touchStartX = 0;
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const swipeThreshold = 50;

      if (Math.abs(deltaX) > swipeThreshold || Math.abs(deltaY) > swipeThreshold) {
        handleSwipe();
      }
    };
    
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [galleryMode, handleSwipe, isLocked]);

  // Effect for handling keyboard navigation (arrow keys and spacebar).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (galleryMode !== 'swipe') return;
      if (isLocked) {
        if(e.key === 'Escape') toggleLock();
        return;
      }
      e.preventDefault();
      handleSwipe();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryMode, handleSwipe, isLocked, toggleLock]);

    // Effect for handling fullscreen change events
    useEffect(() => {
        const handleFullScreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
    }, []);

  // Determine image sizing based on device and orientation.
  const getImageSizeStyle = () => {
    if (!currentImage) return {};
    
    const aspectRatio = currentImage.width / currentImage.height;
    if (isMobile) {
      // On mobile, prioritize width and calculate height based on aspect ratio
      return { width: '90vw', height: 'auto', aspectRatio };
    } else {
      // On desktop, prioritize height and calculate width based on aspect ratio
      return { height: '85vh', width: 'auto', aspectRatio };
    }
  };

  const dismissMobileWarning = () => {
    localStorage.setItem('hasVisitedMemoryLane', 'true');
    setShowMobileWarning(false);
    // Don't set isFirstVisit to false here, so the gallery hints still show
  }


  // Main render method for the component.
  return (
    <div className="fixed inset-0 bg-background overflow-hidden select-none">
      {/* Background Image: A blurred version of an image for atmosphere. */}
      {bgImageSource && <Image
        key={bgImageSource}
        src={bgImageSource}
        alt="Blurred background"
        fill
        quality={20}
        className="object-cover transform-gpu scale-110 blur-xl brightness-75 transition-all duration-1000"
        priority
      />}
      
      {/* Preloading the next image: It's rendered in a hidden div to trigger browser download. */}
      {nextImageSource && (
        <div className="hidden">
          <Image
            src={nextImageSource}
            alt="Preloading next image"
            width={nextImage?.width ?? 1920}
            height={nextImage?.height ?? 1080}
            quality={100}
            priority
          />
        </div>
      )}

      {/* One-time popup for mobile users */}
      <AlertDialog open={showMobileWarning} onOpenChange={setShowMobileWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Best Viewed on Desktop</AlertDialogTitle>
            <AlertDialogDescription>
              For the best experience with interactive zoom and navigation, we recommend viewing on a laptop or desktop computer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={dismissMobileWarning}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {galleryMode === 'swipe' ? (
        // Gallery View: Displayed after the user clicks the "Memories" button.
        <div className="relative w-full h-full flex items-center justify-center p-4" ref={imageContainerRef}>
          {/* Arrow navigation hints for desktop, with hover and timed visibility. */}
          {!isLocked && (
             <>
              <Button aria-label="Previous image" variant="ghost" size="icon" className={cn("absolute left-4 md:left-8 z-20 text-white/50 hover:text-white hover:bg-white/10 transition-opacity duration-300", showHints ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100")} onClick={(e) => { e.stopPropagation(); handleSwipe()}}><ArrowLeft size={32} /></Button>
              <Button aria-label="Next image" variant="ghost" size="icon" className={cn("absolute right-4 md:right-8 z-20 text-white/50 hover:text-white hover:bg-white/10 transition-opacity duration-300", showHints ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100")} onClick={(e) => { e.stopPropagation(); handleSwipe()}}><ArrowRight size={32} /></Button>
              <div className="absolute top-4 left-4 z-20 flex gap-2">
                <Button aria-label="Show all images" variant="ghost" size="icon" className="text-white/50 hover:text-white hover:bg-white/10" onClick={() => setGalleryMode('frozen')}><Grid size={24} /></Button>
                <Button aria-label="Toggle fullscreen" variant="ghost" size="icon" className="text-white/50 hover:text-white hover:bg-white/10" onClick={toggleFullScreen}>
                  {isFullScreen ? <Minimize size={24} /> : <Expand size={24} />}
                </Button>
              </div>
            </>
          )}
          
          {/* First visit tutorial hints */}
          {isFirstVisit && !isLocked && (
            <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
              <div className="relative w-full h-full">
                  {/* Swipe hint */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/50 text-white p-3 rounded-lg text-center animate-pulse">
                      <p>Swipe or use arrow keys to navigate</p>
                  </div>
                  {/* Other hints positioned around the screen */}
                  <p className="absolute top-16 left-4 bg-black/50 text-white p-2 rounded-lg text-sm">Grid View & Fullscreen</p>
                  <p className="absolute bottom-1/4 left-1/2 -translate-x-1/2 bg-black/50 text-white p-2 rounded-lg text-sm">Tap photo to zoom & pan</p>
              </div>
            </div>
          )}


          {isLocked && (
            <Button
              aria-label="Close zoomed view"
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 z-50 text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-all"
              onClick={(e) => { e.stopPropagation(); toggleLock() }}
            >
              <X size={32} />
            </Button>
          )}

          {/* This container holds the visible image and is the target for animations. */}
          <div 
            className="relative drop-shadow-2xl transition-transform duration-500 ease-in-out opacity-0"
            style={{ perspective: '1000px', opacity: currentImage ? 1 : 0 }}
          >
            {currentImage && currentImageSource && (
              <div 
                className={cn(
                  "relative bg-black/30 rounded-lg overflow-hidden shadow-2xl transition-all duration-300 ease-in-out",
                   isLocked ? "cursor-grab" : "cursor-zoom-in"
                )}
                style={getImageSizeStyle()}
                onClick={() => {
                  if (isFirstVisit) {
                    localStorage.setItem('hasVisitedMemoryLane', 'true');
                    setIsFirstVisit(false);
                  }
                }}
              >
                <Image
                  ref={imageRef}
                  key={currentImage.id}
                  src={currentImageSource}
                  alt={currentImage.description}
                  width={currentImage.width}
                  height={currentImage.height}
                  className={cn(
                    "object-contain w-full h-full will-change-transform", // will-change-transform for smoother panning
                    isLocked ? "scale-[2]" : "scale-100",
                    isPanning.current ? "transition-none" : "transition-transform duration-300 ease-in-out" // Disable transition during pan
                  )}
                  style={{ transformOrigin: 'center' }}
                  data-ai-hint={currentImage.imageHint}
                  quality={100}
                  priority
                  sizes={isMobile ? "90vw" : "85vh"}
                />
              </div>
            )}
          </div>
        </div>
      ) : galleryMode === 'frozen' ? (
        // Frozen Grid View
        <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
          <Button aria-label="Return to landing" variant="ghost" size="icon" className="absolute top-4 left-4 z-20 text-white/50 hover:text-white hover:bg-white/10" onClick={returnToLanding}><ArrowLeft size={24} /></Button>
          <Button aria-label="Back to swipe view" variant="ghost" size="icon" className="absolute top-4 right-4 z-20 text-white/50 hover:text-white hover:bg-white/10" onClick={() => setGalleryMode('swipe')}><ImageIcon size={24} /></Button>
          
          <h2 className="text-3xl md:text-4xl font-headline text-white/90 drop-shadow-lg my-4" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)'}}>
            Frozen Memories
          </h2>
          <ScrollArea className="w-full h-[80%] bg-black/20 rounded-lg">
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {allImages.map(image => (
                <FrozenImageTile key={image.id} image={image} onClick={() => handleFrozenImageClick(image)} />
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        // Landing Page View: The initial screen of the application.
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-headline text-white/90 drop-shadow-lg mb-8" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.3)'}}>
              Memory Lane
            </h1>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={startGallery}
                className="bg-primary/80 hover:bg-primary text-primary-foreground text-lg font-semibold px-8 py-6 rounded-lg backdrop-blur-sm transition-all hover:scale-105 active:scale-100 shadow-lg hover:shadow-xl"
              >
                View Memories
              </Button>
              <Button
                onClick={showFrozenGallery}
                variant="secondary"
                className="bg-secondary/80 hover:bg-secondary text-secondary-foreground text-lg font-semibold px-8 py-6 rounded-lg backdrop-blur-sm transition-all hover:scale-105 active:scale-100 shadow-lg hover:shadow-xl"
              >
                Frozen
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-4 right-4 text-xs text-white/30 pointer-events-none">
        created by AIsahil
      </div>
    </div>
  );
}

// A new component for the grid view tiles to use the offline hook
function FrozenImageTile({ image, onClick }: { image: ImagePlaceholder; onClick: () => void; }) {
  const imageSource = useOfflineImage(image.imageUrl);
  return (
    <div className="relative aspect-square rounded-md overflow-hidden cursor-pointer group" onClick={onClick}>
      {imageSource && <Image
        src={imageSource}
        alt={image.description}
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-110"
        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
      />}
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
    </div>
  )
}
