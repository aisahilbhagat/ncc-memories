// src/components/image-cacher.tsx
'use client';

import { useEffect } from 'react';
import { storeImage, getImage, openDB } from '@/lib/indexed-db';
import type { ImagePlaceholder } from '@/lib/placeholder-images';

const DB_STORE_NAME = 'images';

// This component now runs silently in the background.
// It checks for differences between the required images and what's in IndexedDB,
// then only fetches what's missing and removes what's no longer needed.
export function ImageCacher({ images }: { images: ImagePlaceholder[] }) {
  useEffect(() => {
    const syncCache = async () => {
      try {
        const db = await openDB();
        const transaction = db.transaction(DB_STORE_NAME, 'readonly');
        const store = transaction.objectStore(DB_STORE_NAME);
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = async () => {
          const cachedItems = getAllRequest.result;
          const cachedUrls = new Set(cachedItems.map(item => item.url));
          const requiredUrls = new Set(images.map(image => image.imageUrl));

          // 1. Find images that need to be added to the cache
          const imagesToCache = images.filter(image => !cachedUrls.has(image.imageUrl));
          if (imagesToCache.length > 0) {
            console.log(`Caching ${imagesToCache.length} new image(s) in the background...`);
            for (const image of imagesToCache) {
              try {
                const response = await fetch(image.imageUrl);
                if (!response.ok) throw new Error(`Failed to fetch ${image.imageUrl}`);
                const blob = await response.blob();
                await storeImage(image.imageUrl, blob);
              } catch (error) {
                console.error(`Failed to cache image: ${image.imageUrl}`, error);
              }
            }
            console.log('Background caching complete.');
          }

          // 2. Find images that need to be removed from the cache
          const urlsToRemove = [...cachedUrls].filter(url => !requiredUrls.has(url));
          if (urlsToRemove.length > 0) {
             console.log(`Removing ${urlsToRemove.length} stale image(s) from the cache...`);
             const deleteTransaction = db.transaction(DB_STORE_NAME, 'readwrite');
             const deleteStore = deleteTransaction.objectStore(DB_STORE_NAME);
             urlsToRemove.forEach(url => {
                 deleteStore.delete(url);
             });
             console.log('Stale images removed.');
          }

          if (imagesToCache.length === 0 && urlsToRemove.length === 0) {
            console.log('Image cache is up to date.');
          }
        };

        getAllRequest.onerror = (event) => {
            console.error("Error fetching cached items from IndexedDB:", event);
        }

      } catch (error) {
        console.error('Error during cache sync:', error);
      }
    };

    // Run on mount
    syncCache();
  }, [images]);

  // This component no longer renders anything to the UI.
  return null;
}
