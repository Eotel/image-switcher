export function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const loader = new Image();
    loader.onload = () => resolve(loader);
    loader.onerror = reject;
    loader.src = url;
  });
}
