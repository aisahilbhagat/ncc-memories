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


  // Hook to detect mobile viewport.
  const isMobile = useIsMobile();

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isAnimating = useRef(false);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panPosition = useRef({ x: 0, y: 0 });
  const didPan = useRef(false); // Track if a pan occurred during a pointer down

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
    showNextImage();
  }, [showNextImage, isLocked]);

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
  }, [isLocked, currentImage]);

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


  // Main render method for the component.
  return (
    <div className="fixed inset-0 bg-background overflow-hidden select-none">
      {/* Background Image: A blurred version of an image for atmosphere. */}
      <Image
        key={galleryMode === 'swipe' ? (currentImage?.id ?? initialBgImage.id) : initialBgImage.id}
        src={(galleryMode === 'swipe' && currentImage) ? currentImage.imageUrl : initialBgImage.imageUrl}
        alt="Blurred background"
        fill
        quality={20}
        className="object-cover transform-gpu scale-110 blur-xl brightness-75 transition-all duration-1000"
        priority
      />
      
      {/* Preloading the next image: It's rendered in a hidden div to trigger browser download. */}
      {nextImage && (
        <div className="hidden">
          <Image
            src={nextImage.imageUrl}
            alt="Preloading next image"
            width={nextImage.width}
            height={nextImage.height}
            quality={100}
            priority
          />
        </div>
      )}

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
            {currentImage && (
              <div 
                className={cn(
                  "relative bg-black/30 rounded-lg overflow-hidden shadow-2xl transition-all duration-300 ease-in-out",
                   isLocked ? "cursor-grab" : "cursor-zoom-in"
                )}
                style={getImageSizeStyle()}
              >
                <Image
                  ref={imageRef}
                  key={currentImage.id}
                  src={currentImage.imageUrl}
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
                <div key={image.id} className="relative aspect-square rounded-md overflow-hidden cursor-pointer group" onClick={() => handleFrozenImageClick(image)}>
                  <Image
                    src={image.imageUrl}
                    alt={image.description}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-110"
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
                </div>
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
