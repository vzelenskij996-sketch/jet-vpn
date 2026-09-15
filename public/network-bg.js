(() => {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let nodes = [];

  function resize(){
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(16, Math.min(34, Math.floor(width / 42)));
    nodes = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 2 + Math.random() * 3,
      vx: (Math.random() - 0.5) * (reduceMotion ? 0.08 : 0.28),
      vy: (Math.random() - 0.5) * (reduceMotion ? 0.08 : 0.28),
      phase: index * 0.7
    }));
  }

  function draw(time){
    context.clearRect(0, 0, width, height);
    nodes.forEach(node => {
      if (!reduceMotion){
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -20 || node.x > width + 20) node.vx *= -1;
        if (node.y < -20 || node.y > height + 20) node.vy *= -1;
      }
    });

    for (let first = 0; first < nodes.length; first += 1){
      for (let second = first + 1; second < nodes.length; second += 1){
        const dx = nodes[first].x - nodes[second].x;
        const dy = nodes[first].y - nodes[second].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 190){
          context.strokeStyle = `rgba(147,3,197,${(1 - distance / 190) * 0.32})`;
          context.lineWidth = 0.7;
          context.beginPath();
          context.moveTo(nodes[first].x, nodes[first].y);
          context.lineTo(nodes[second].x, nodes[second].y);
          context.stroke();
        }
      }
    }

    nodes.forEach(node => {
      const pulse = reduceMotion ? 0 : Math.sin(time / 900 + node.phase) * 0.8;
      const size = node.size + pulse;
      context.fillStyle = 'rgba(147,3,197,0.9)';
      context.shadowColor = 'rgba(147,3,197,0.8)';
      context.shadowBlur = 9;
      context.fillRect(node.x - size / 2, node.y - size / 2, size, size);
      context.shadowBlur = 0;
    });
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  requestAnimationFrame(draw);
})();
