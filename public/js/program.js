(() => {
  const img = document.getElementById('program-img');
  const overlay = document.getElementById('overlay');
  const channel = new BroadcastChannel(CHANNEL_NAME);

  overlay.addEventListener('click', () => {
    document.documentElement.requestFullscreen().catch(() => {});
    overlay.classList.add('hidden');
  });

  channel.onmessage = (e) => {
    const { type, imageUrl } = e.data;

    switch (type) {
      case 'take': {
        const loader = new Image();
        loader.onload = () => {
          img.src = imageUrl;
          img.classList.add('visible');
        };
        loader.src = imageUrl;
        break;
      }
      case 'black':
        img.classList.remove('visible');
        break;
    }
  };
})();
