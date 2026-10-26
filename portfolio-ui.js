import {createLiquidChrome} from './liquid-chrome.js';
import {createIridescence} from './iridescence.js';
import {createGlassSurface} from './glass-surface.js';

const panelNames = new Set(['project', 'about', 'contact']);
const text = value => typeof value === 'string' ? value.trim() : '';
const pad = number => String(number).padStart(2, '0');

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function arrow(direction = 'right') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 28 20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('portfolio-arrow', `portfolio-arrow-${direction}`);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M2 10h23M17 3l7 7-7 7');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function button(label, action, direction = null, className = '') {
  const node = element('button', `portfolio-link ${className}`.trim());
  node.type = 'button';
  if (direction === 'left') node.append(arrow(direction));
  node.append(element('span', '', label));
  if (direction && direction !== 'left') node.append(arrow(direction));
  node.addEventListener('click', action);
  return node;
}

// Only explicit web/local media URLs are rendered; content never becomes HTML.
export function portfolioMediaURL(value) {
  const source = text(value);
  if (!source || /[\u0000-\u001f]/.test(source)) return '';
  if (/^data:(?:image|video)\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(source)) return source;
  try {
    const url = new URL(source, document.baseURI);
    return ['http:', 'https:', 'file:', 'blob:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function contactURL(value) {
  try {
    const url = new URL(text(value));
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function createPortfolioUI({content, onNavigate, onBack, onProjectStep, onRecordOpen, onPreviewOpen, onPreviewDrag, onPreviewMove, onPreviewHold = () => {}}) {
  const projects = content.projects || [];
  const records = content.records || projects;
  const profile = content.profile || {};
  const root = element('div');
  root.id = 'portfolio-ui';
  root.dataset.panelOpen = 'false';

  const panel = element('section', 'portfolio-panel');
  panel.dataset.portfolioPanel = '';
  panel.setAttribute('aria-labelledby', 'portfolio-title');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  const panelBody = element('div', 'portfolio-panel-body');
  panel.append(panelBody);
  const projectRecord = element('div', 'project-record-window');
  projectRecord.setAttribute('aria-hidden', 'true');
  projectRecord.hidden = true;
  const recordDisc = element('div', 'project-record-disc');
  const recordArtwork = element('img', 'project-record-artwork');
  recordArtwork.crossOrigin = 'anonymous';
  recordArtwork.decoding = 'async';
  recordArtwork.alt = '';
  recordArtwork.draggable = false;
  recordArtwork.decoding = 'async';
  recordArtwork.addEventListener('error', () => { recordArtwork.hidden = true; });
  recordDisc.append(recordArtwork);
  projectRecord.append(recordDisc);
  panel.append(projectRecord);

  const footer = element('div', 'portfolio-context');
  footer.dataset.visible = 'false';
  footer.inert = true;
  const contextLabel = element('div', 'portfolio-context-label');
  contextLabel.setAttribute('aria-live', 'polite');
  contextLabel.setAttribute('aria-atomic', 'true');
  const contextTitle = element('div', 'portfolio-context-title');
  const contextCategory = element('div', 'portfolio-context-category');
  contextLabel.append(contextTitle, contextCategory);
  const contextActions = element('div', 'portfolio-context-actions');
  const contextCount = element('span', 'portfolio-context-count');
    footer.append(contextLabel, contextActions, contextCount);
  const preview = element('div', 'portfolio-gallery-preview');
  preview.dataset.visible = 'false';
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  const previewSurface = element('div', 'portfolio-gallery-preview-surface');
  let activePreview = null, previewHovered = false;
  const previewButton = button('LOAD RECORD', () => {
    if (activePreview) onPreviewOpen({...activePreview});
  }, 'right', 'portfolio-gallery-project');
  previewButton.setAttribute('aria-label', 'Load record');
  previewSurface.append(previewButton);
  preview.append(previewSurface);
  root.append(panel, footer, preview);
  document.body.append(root);
  const previewGlass = createGlassSurface(previewButton);
  const holdPreview = () => onPreviewHold(previewHovered || preview.contains(document.activeElement));
  previewButton.addEventListener('pointerenter', () => { previewHovered = true; holdPreview(); });
  previewButton.addEventListener('pointerleave', () => { previewHovered = false; holdPreview(); });
  previewButton.addEventListener('focus', holdPreview);
  previewButton.addEventListener('blur', holdPreview);
  let previewGesture = null, draggedPointer = null, suppressClickUntil = 0;
  previewButton.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType !== 'touch' && event.button !== 0)) return;
    previewGesture = {pointerId: event.pointerId, pointerType: event.pointerType, startX: event.clientX, startY: event.clientY};
    previewButton.setPointerCapture(event.pointerId);
  });
  previewButton.addEventListener('pointermove', event => {
    if (!previewGesture && event.pointerType !== 'touch' && !event.buttons) {
      onPreviewMove?.({x: event.clientX, y: event.clientY});
      return;
    }
    if (!previewGesture || previewGesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - previewGesture.startX, event.clientY - previewGesture.startY) <= 6) return;
    if (onPreviewDrag({...previewGesture, x: event.clientX, y: event.clientY})) {
      draggedPointer = event.pointerId;
      suppressClickUntil = performance.now() + 500;
      previewGesture = null;
      setGalleryPreview(null);
    }
  });
  const finishPreviewGesture = event => {
    if (previewGesture?.pointerId === event.pointerId) previewGesture = null;
    if (draggedPointer === event.pointerId) {
      suppressClickUntil = performance.now() + 500;
      draggedPointer = null;
    }
  };
  window.addEventListener('pointerup', finishPreviewGesture, true);
  window.addEventListener('pointercancel', finishPreviewGesture, true);
  previewButton.addEventListener('click', event => {
    if (event.detail > 0 && performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  let state = {route: {name: 'home'}, projectIndex: 0, galleryMode: 'machine'};
  let panelKey = '', footerKey = '', currentIndex = -1, closeTimer = 0;
  const panelScroll = new Map();
  let disposed = false;
  let mediaObserver;
  let contactVisual = null;
  let projectVisual = null;
  let recordGlass = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function disposeContactVisual() {
    contactVisual?.dispose();
    contactVisual = null;
  }

  function stopMedia(unload = false) {
    if (unload) { projectVisual?.dispose(); projectVisual = null; }
    panel.querySelectorAll('video').forEach(video => {
      video.pause();
      if (unload) { video.removeAttribute('src'); video.load(); }
    });
    if (unload) { mediaObserver?.disconnect(); mediaObserver = null; }
  }
  const visibility = () => {
    if (document.hidden) stopMedia();
    projectRecord.dataset.paused = String(document.hidden);
  };
  document.addEventListener('visibilitychange', visibility);

  function heading(title) {
    const node = element('h1', 'portfolio-title', title);
    node.id = 'portfolio-title';
    node.tabIndex = -1;
    node.dataset.portfolioTitle = '';
    return node;
  }

  function back(label, callback) {
    const row = element('div', 'portfolio-back-row');
    row.append(button(label, callback, 'left', 'portfolio-back'));
    return row;
  }

  function projectTitle(project, index) {
    return text(project?.title) || `Project ${project?.id || pad(index + 1)}`;
  }

  function mediaError(container, label, retry) {
    container.classList.add('portfolio-media-error');
    const message = element('div', 'portfolio-media-message');
    message.append(element('p', '', label));
    if (retry) message.append(button('Retry', () => { message.remove(); container.classList.remove('portfolio-media-error'); retry(); }));
    container.append(message);
  }

  function projectPlaceholder(id, processIndex = null) {
    const cover = processIndex === null;
    const frame = element('figure', `portfolio-media-frame project-placeholder ${cover ? 'project-placeholder-cover' : 'project-placeholder-process'}`);
    frame.dataset.palette = id;
    frame.dataset.study = cover ? 'cover' : String(processIndex % 2);
    const caption = element('figcaption', 'project-placeholder-caption');
    caption.append(element('span', 'project-placeholder-name', `GRADIENT STUDY / ${id}`));
    caption.append(element('span', 'project-placeholder-type', cover ? 'COLOR · FORM · EXPLORATION' : `EXPLORATION ${pad(processIndex + 1)}`));
    frame.append(caption);
    return frame;
  }

  function projectStory(project, index) {
    const sections = [
      ['idea', '一个怎样的想法', text(project.overview), '从一组颜色开始，让柔和的过渡与自由的形态成为画面的语言。这里可以承载你的创作灵感与项目背景。'],
      ['process', '从想法到实现', text(project.process), '同一组色彩，不同的构图与节奏。用连续的画面展开探索，也为草图、过程或动态作品留下空间。'],
      ['outcome', '作品之后', text(project.outcome), '为下一次好奇留一点空间。这是一份开放的作品集模板，你可以将渐变示例替换成自己的图片或视频。'],
    ];
    sections.forEach(([kind, title, copy, placeholder]) => {
      const processImages = kind === 'process' && Array.isArray(project.processImages) ? project.processImages : [];
      if (!project.template && !copy && !processImages.length) return;
      const section = element('section', `project-story-section project-story-${kind}`);
      const content = element('div', 'project-story-copy');
      content.append(element('h2', '', title));
      if (copy || project.template) content.append(element('p', '', copy || placeholder));
      section.append(content);
      if (kind === 'process' && (project.template || processImages.length)) {
        const grid = element('div', 'project-process-grid');
        for (let i = 0; i < Math.max(project.template ? 2 : 0, processImages.length); i++) {
          if (processImages[i]) grid.append(projectMedia({images: [processImages[i]]}, index));
          else grid.append(projectPlaceholder(project.id, i));
        }
        section.append(grid);
      }
      panelBody.append(section);
    });
  }

  function projectMedia(project, index) {
    const group = element('div', 'portfolio-media-group');
    if (project.mainVisual?.type === 'iridescence') {
      const frame = element('figure', 'portfolio-media-frame project-iridescence');
      frame.setAttribute('role', 'img');
      frame.setAttribute('aria-label', 'Iridescence — Pearl 珍珠虹彩动态主视觉');
      group.append(frame);
      projectVisual = createIridescence(frame, project.mainVisual);
      return group;
    }
    const videoSource = portfolioMediaURL(project.video);
    const posterSource = portfolioMediaURL(project.poster);
    const imageSources = (Array.isArray(project.images) ? project.images : []).map(item => ({
      src: portfolioMediaURL(typeof item === 'string' ? item : item?.src),
      alt: text(typeof item === 'string' ? '' : item?.alt),
    })).filter(item => item.src);
    if (!videoSource && !posterSource && !imageSources.length) {
      if (project.template) {
        group.append(projectPlaceholder(project.id));
        return group;
      }
      const empty = element('div', 'portfolio-media-empty');
      empty.append(element('p', '', '作品即将呈现'));
      group.append(empty);
      return group;
    }
    if (videoSource) {
      const frame = element('div', 'portfolio-media-frame');
      const video = element('video', 'portfolio-video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = videoSource;
      if (posterSource) video.poster = posterSource;
      video.setAttribute('aria-label', `${projectTitle(project, index)} — video`);
      video.addEventListener('loadedmetadata', () => {
        if (video.videoWidth && video.videoHeight) video.style.setProperty('--media-ratio', String(video.videoWidth / video.videoHeight));
      });
      video.addEventListener('error', () => {
        if (video.getAttribute('src') && !frame.querySelector('.portfolio-media-message')) {
          mediaError(frame, '暂时无法播放此视频。', () => { video.src = videoSource; video.load(); });
        }
      });
      frame.append(video);
      group.append(frame);
    }
    const figures = !videoSource && posterSource ? [{src: posterSource, alt: projectTitle(project, index)}, ...imageSources] : imageSources;
    for (const source of figures) {
      const figure = element('figure', 'portfolio-media-frame');
      const image = element('img', 'portfolio-project-image');
      image.src = source.src;
      image.alt = source.alt || projectTitle(project, index);
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        if (!figure.querySelector('.portfolio-media-message')) mediaError(figure, '图像暂时无法加载。');
      });
      figure.append(image);
      group.append(figure);
    }
    return group;
  }

  function projectPanel(index) {
    const project = records[index] || {id: pad(index + 1)};
    const projectNumber = projects.findIndex(item => item.id === project.id) + 1;
    panelBody.dataset.surface = 'project';
    panelBody.dataset.projectLayout = project.detailLayout || 'editorial';
    if (project.detailLayout === 'pearl-study') { pearlProjectPanel(project, projectNumber); return; }
    const artwork = portfolioMediaURL(project.recordArtwork);
    projectRecord.dataset.projectId = project.id;
    recordArtwork.hidden = !artwork;
    if (artwork) recordArtwork.src = artwork;
    else recordArtwork.removeAttribute('src');
    panelBody.dataset.surface = 'project';
    panelBody.append(back('返回唱片架', () => onNavigate({name: 'projects'})));
    const intro = element('header', 'project-intro');
    intro.append(element('p', 'project-edition', `${pad(projectNumber)} / ${pad(projects.length)}`));
    intro.append(heading(text(project.title) || projectTitle(project, index)));
    const summary = text(project.description) || (project.template ? '以色彩、形态与节奏，探索一种作品呈现的可能。' : '');
    if (summary) intro.append(element('p', 'project-intro-summary', summary));
    const metadata = [text(project.year), text(project.category), text(project.role)];
    if (metadata.some(Boolean)) {
      const line = element('ul', 'project-meta-line');
      line.setAttribute('aria-label', '项目信息');
      metadata.filter(Boolean).forEach(value => line.append(element('li', '', value)));
      intro.append(line);
    }
    if (project.template) intro.append(element('p', 'project-draft-note', 'PORTFOLIO TEMPLATE · 渐变视觉示例'));
    panelBody.append(intro, projectMedia(project, index));
    projectStory(project, index);
    if (text(project.tools)) {
      const tools = element('div', 'project-tools-note');
      tools.append(element('span', '', '使用工具'), element('p', '', text(project.tools)));
      panelBody.append(tools);
    }
    const navigation = element('nav', 'project-record-navigation');
    navigation.setAttribute('aria-label', 'Project navigation');
    const nextProject = projects[projectNumber % projects.length];
    if (nextProject) {
      const next = button('', () => onProjectStep(1), 'right', 'project-next-record');
      next.setAttribute('aria-label', `下一张唱片：${projectTitle(nextProject, projectNumber)}`);
      const copy = next.querySelector('span');
      copy.className = 'project-next-copy';
      copy.append(element('span', 'project-next-label', '下一张唱片'), element('span', 'project-next-name', projectTitle(nextProject, projectNumber)));
      const nextArtwork = portfolioMediaURL(nextProject.recordArtwork);
      if (nextArtwork) {
        const disc = element('img', 'project-next-disc');
        disc.crossOrigin = 'anonymous'; disc.loading = 'lazy'; disc.decoding = 'async';
        disc.src = nextArtwork; disc.alt = ''; disc.draggable = false;
        next.insertBefore(disc, next.lastElementChild);
      }
      navigation.append(next);
    }
    const links = element('div', 'project-bottom-links');
    links.append(button('上一张唱片', () => onProjectStep(-1), 'left'), button('返回唱片架', () => onNavigate({name: 'projects'})));
    navigation.append(links);
    panelBody.append(navigation);
  }

  function pearlProjectPanel(project, projectNumber) {
    const visuals = [];
    projectVisual = {dispose() { visuals.forEach(visual => visual.dispose()); }};
    const top = back('Back to collection', () => onNavigate({name: 'projects'}));
    top.append(element('span', 'portfolio-counter', `${pad(projectNumber)} / ${pad(projects.length)}`));
    const intro = element('div', 'pearl-intro');
    const title = element('div', 'pearl-title-block');
    title.append(heading('Pearl'), element('p', 'pearl-subtitle', 'Project 01 · Iridescence'));
    const summary = element('div', 'pearl-summary');
    const disc = element('img', 'pearl-intro-disc');
    disc.src = portfolioMediaURL(project.recordArtwork); disc.alt = ''; disc.draggable = false;
    const copy = element('div', 'pearl-summary-copy');
    copy.append(element('h2', '', '让光流动起来。'), element('p', '', '一场关于色彩、折射与触感的视觉实验。'));
    summary.append(disc, copy); intro.append(title, summary);

    const hero = element('section', 'pearl-playground');
    hero.setAttribute('aria-label', 'Pearl 互动主视觉');
    const surface = element('div', 'portfolio-media-frame project-iridescence pearl-hero');
    surface.setAttribute('role', 'img'); surface.setAttribute('aria-label', '可移动、点击扰动的珍珠虹彩');
    const main = createIridescence(surface, project.mainVisual); visuals.push(main);
    const pause = button('暂停动效', () => {
      paused = !paused; updateMotion();
    }, null, 'pearl-pause');
    const pauseIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pauseIcon.setAttribute('viewBox', '0 0 20 20'); pauseIcon.setAttribute('aria-hidden', 'true');
    const pausePath = document.createElementNS(pauseIcon.namespaceURI, 'path');
    pausePath.setAttribute('fill', 'currentColor'); pauseIcon.append(pausePath); pause.prepend(pauseIcon);
    let paused = false;
    function updateMotion() {
      main.setOptions?.({paused});
      pause.querySelector('span').textContent = paused ? '继续动效' : '暂停动效';
      pause.setAttribute('aria-pressed', String(paused));
      pausePath.setAttribute('d', paused ? 'M6 3 17 10 6 17Z' : 'M5 3h3v14H5zM12 3h3v14h-3z');
    }
    updateMotion();
    const stage = element('div', 'pearl-stage'); stage.append(surface, pause);
    const caption = element('div', 'pearl-hero-caption');
    caption.append(element('span', '', 'Iridescence / Pearl'), element('span', '', '移动、点击，感受光的变化。'));
    const controls = element('div', 'pearl-controls');
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '调整材质');
    const sliders = [];
    for (const [key, label, min, max, value] of [
      ['speed', '流动速度', .2, 1.8, 1], ['saturation', '色彩浓度', 0, 1.2, .55], ['scale', '纹理尺度', .6, 2, 1.4],
    ]) {
      const control = element('div', 'pearl-control');
      const controlLabel = element('label', '', label); controlLabel.htmlFor = `pearl-${key}`;
      const output = element('output', '', value.toFixed(2)); output.htmlFor = `pearl-${key}`;
      const input = element('input'); input.type = 'range'; input.id = `pearl-${key}`;
      input.min = String(min); input.max = String(max); input.step = '.01'; input.value = String(value);
      const sync = () => {
        output.value = Number(input.value).toFixed(2);
        input.style.setProperty('--range-fill', `${(Number(input.value) - min) / (max - min) * 100}%`);
      };
      input.addEventListener('input', () => { sync(); main.setOptions?.({[key]: Number(input.value)}); });
      sliders.push({input, sync, key, value}); sync(); control.append(controlLabel, output, input); controls.append(control);
    }
    const reset = button('还原', () => {
      for (const slider of sliders) { slider.input.value = String(slider.value); slider.sync(); }
      main.setOptions?.({speed: 1, saturation: .55, scale: 1.4}); paused = false; updateMotion();
    }, null, 'pearl-reset');
    controls.append(reset); hero.append(stage, caption, controls);

    const studies = element('section', 'pearl-studies');
    const studiesIntro = element('div', 'pearl-studies-intro');
    const studiesCopy = element('div');
    studiesCopy.append(element('h2', '', '同一种光，\n不同的表情。'), element('p', '', '从柔和的晕染，到更清晰的折射，变化发生在每一道纹理之间。'));
    studiesIntro.append(element('p', 'pearl-section-label', '材质观察'), studiesCopy);
    const variations = element('div', 'pearl-variations');
    for (const variant of [
      {label: '01 / 柔光', scale: 1, detail: 6, initialTime: 4},
      {label: '02 / 折射', scale: 1.4, detail: 14, initialTime: 8},
    ]) {
      const figure = element('figure', 'pearl-study');
      const image = element('div', 'portfolio-media-frame project-iridescence pearl-study-image');
      image.setAttribute('role', 'img'); image.setAttribute('aria-label', variant.label);
      visuals.push(createIridescence(image, {...project.mainVisual, ...variant, paused: true, mouseReact: false, clickSwirl: false}));
      const figcaption = element('figcaption');
      figcaption.append(element('span', '', variant.label), element('span', '', variant.scale.toFixed(2)));
      figure.append(image, figcaption); variations.append(figure);
    }
    studies.append(studiesIntro, variations);

    const nextProject = projects[projectNumber % projects.length];
    const navigation = element('nav', 'pearl-next'); navigation.setAttribute('aria-label', 'Project navigation');
    const next = button('下一张唱片', () => onNavigate({name: 'project', id: nextProject.id}), 'up-right', 'pearl-next-button');
    const nextCopy = element('span', 'pearl-next-copy');
    nextCopy.append(element('span', 'pearl-next-title', '下一张唱片'), element('span', 'pearl-next-name', projectTitle(nextProject, projectNumber)));
    next.querySelector('span').replaceWith(nextCopy);
    const nextDisc = element('img', 'pearl-next-disc'); nextDisc.crossOrigin = 'anonymous'; nextDisc.src = portfolioMediaURL(nextProject.recordArtwork); nextDisc.alt = ''; nextDisc.draggable = false;
    next.append(nextDisc);
    navigation.append(button('返回唱片架', () => onNavigate({name: 'projects'}), 'left'), next);
    const credit = element('a', 'pearl-credit', 'Visual: React Bits / Iridescence');
    credit.href = 'https://reactbits.dev/backgrounds/iridescence'; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
    panelBody.append(top, intro, hero, studies, navigation, credit);
    if (!main.setOptions) {
      controls.hidden = true; pause.hidden = true;
      caption.lastElementChild.textContent = '当前浏览器显示静态预览';
    }
  }

  function profileRecord(main) {
    const record = element('div', 'portfolio-chrome-record');
    record.setAttribute('aria-hidden', 'true');
    main.append(record);
    contactVisual = createLiquidChrome(record, {
      speed: .16, color: '#ffffff', lightMode: false, amplitude: .4,
      frequencyX: 3.2, frequencyY: 3.2, roughness: .22, exposure: 1,
      tilt: .55, rippleStrength: .7, initialTime: 14,
    });
  }

  function aboutPanel() {
    panelBody.dataset.surface = 'about';
    panelBody.append(back('Back', onBack));
    const main = element('div', 'portfolio-profile-main portfolio-contact-layout');
    const copy = element('div', 'portfolio-contact-copy portfolio-about-copy');
    const title = heading();
    title.append(element('span', '', 'Hi,'), element('span', '', text(profile.name) || 'fafa'));
    copy.append(title);
    const disciplines = element('ul', 'portfolio-disciplines');
    (profile.disciplines || []).filter(text).forEach(value => disciplines.append(element('li', '', value)));
    copy.append(disciplines);
    if (text(profile.bio)) copy.append(element('p', 'portfolio-bio', profile.bio));
    main.append(copy);
    panelBody.append(main);
    profileRecord(main);
    const links = element('nav', 'portfolio-contacts');
    links.setAttribute('aria-label', 'Explore portfolio');
    [['作品', 'Explore projects', 'projects'], ['联系', "Let’s talk", 'contact']].forEach(([label, value, name]) => {
      const link = button('', () => onNavigate({name}), 'up-right', 'portfolio-contact-item');
      const details = link.querySelector('span');
      details.className = 'portfolio-contact-details';
      details.append(element('span', 'portfolio-contact-label', label), element('span', 'portfolio-contact-value', value));
      links.append(link);
    });
    const foot = element('div', 'portfolio-panel-footer');
    foot.append(element('span', 'portfolio-signature', 'fafah'));
    panelBody.append(links, foot);
  }

  function contactPanel() {
    panelBody.dataset.surface = 'contact';
    panelBody.append(back('Back', onBack));
    const main = element('div', 'portfolio-profile-main portfolio-contact-layout');
    const copy = element('div', 'portfolio-contact-copy');
    const title = heading();
    title.append(element('span', '', "Let's"), document.createTextNode(' '), element('span', '', 'talk'));
    copy.append(title);
    const contacts = element('div', 'portfolio-contacts');
    function contactLink(label, value, href) {
      const link = element('a', 'portfolio-link portfolio-contact-item');
      link.href = href;
      const details = element('span', 'portfolio-contact-details');
      details.append(element('span', 'portfolio-contact-label', label), element('span', 'portfolio-contact-value', value));
      link.append(details, arrow('up-right'));
      return link;
    }
    const email = text(profile.email);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const mail = contactLink('邮箱', email, `mailto:${encodeURIComponent(email).replace('%40', '@')}`);
      const collaborate = element('a', 'portfolio-link portfolio-collaborate', '聊聊合作');
      collaborate.href = mail.href;
      collaborate.append(arrow('up-right'));
      copy.append(collaborate);
      contacts.append(mail);
    }
    (profile.links || []).forEach(item => {
      const href = contactURL(item.url);
      if (!href || !text(item.label)) return;
      const link = contactLink(text(item.platform), item.label, href);
      if (!href.startsWith('mailto:')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      contacts.append(link);
    });
    if (!contacts.childElementCount) contacts.append(element('p', 'portfolio-contact-empty', '联系方式即将更新'));
    main.append(copy);
    panelBody.append(main, contacts);
    profileRecord(main);
    const foot = element('div', 'portfolio-panel-footer');
    foot.append(element('span', 'portfolio-signature', 'fafah'));
    panelBody.append(foot);
  }

  function observeMedia() {
    if (!('IntersectionObserver' in window)) {
      panel.querySelectorAll('.portfolio-media-frame').forEach(frame => { frame.dataset.revealed = 'true'; });
      return;
    }
    mediaObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.dataset.revealed = 'true';
        else entry.target.querySelector('video')?.pause();
      });
    }, {root: panel, threshold: .08});
    panel.querySelectorAll('.portfolio-media-frame').forEach(frame => mediaObserver.observe(frame));
  }

  function setGalleryIndex(index) {
    const safeIndex = Math.max(0, Math.min(records.length - 1, Number(index) || 0));
    if (currentIndex === safeIndex) return;
    currentIndex = safeIndex;
    const project = records[safeIndex];
    contextTitle.textContent = projectTitle(project, safeIndex);
    contextCategory.textContent = text(project?.category);
    contextCategory.hidden = !contextCategory.textContent;
    contextCount.textContent = `${pad(safeIndex + 1)} / ${pad(records.length)}`;
  }

  function setGalleryPreview(value) {
    const visible = value && state.route.name === 'projects' && state.galleryMode === 'gallery';
    if (!visible) {
      if (activePreview) {
        activePreview = null;
        previewHovered = false;
        onPreviewHold(false);
        preview.dataset.visible = 'false';
        preview.setAttribute('aria-hidden', 'true');
        preview.inert = true;
      }
      return;
    }
    const appearing = !activePreview;
    const changed = activePreview?.slot !== value.slot;
    activePreview = value;
    const width = 176;
    const halfHeight = 26;
    const x = Math.max(width / 2 + 16, Math.min(innerWidth - width / 2 - 16, value.x));
    const topLimit = innerWidth <= 700 ? 150 : 110;
    const y = Math.max(topLimit + halfHeight, Math.min(innerHeight - 138 - halfHeight, value.y));
    preview.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-50%)`;
    preview.dataset.projectId = value.id;
    preview.dataset.source = value.source;
    preview.dataset.visible = 'true';
    preview.setAttribute('aria-hidden', 'false');
    preview.inert = false;
    if (changed) {
      previewButton.setAttribute('aria-label', `Load record — ${projectTitle(records[value.index], value.index)}`);
      if (appearing && !reducedMotion.matches) {
        previewSurface.getAnimations().forEach(animation => animation.cancel());
        previewSurface.animate([
          {opacity: 0},
          {opacity: 1},
        ], {duration: 100, easing: 'ease-out'});
      }
    }
  }

  function render(next) {
    if (disposed) return;
    state = {...state, ...next};
    const {route, projectIndex, galleryMode} = state;
    const name = route.name;
    projectRecord.hidden = name !== 'project' || records[projectIndex]?.detailLayout === 'pearl-study';
    projectRecord.dataset.paused = String(document.hidden);
    if (name !== 'projects' || galleryMode !== 'gallery') setGalleryPreview(null);
    const isPanel = panelNames.has(name);
    root.dataset.route = name;
    root.dataset.panelOpen = String(isPanel);
    panel.setAttribute('aria-hidden', String(!isPanel));
    panel.inert = !isPanel;
    if (isPanel) {
      clearTimeout(closeTimer);
      const key = `${name}:${name === 'project' ? projectIndex : ''}`;
      if (panelKey !== key) {
        if (panelKey) panelScroll.set(panelKey, panel.scrollTop);
        stopMedia(true);
        disposeContactVisual();
        panelBody.replaceChildren();
        delete panelBody.dataset.projectLayout;
        if (name === 'project') projectPanel(projectIndex);
        else if (name === 'about') aboutPanel();
        else contactPanel();
        panel.scrollTop = panelScroll.get(key) || 0;
        panelBody.getAnimations().forEach(animation => animation.cancel());
        if (!reducedMotion.matches) panelBody.animate([{opacity: 0, transform: 'translateY(20px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 520, easing: 'cubic-bezier(.16,1,.3,1)'});
        panelKey = key;
        observeMedia();
      }
    } else if (panelKey) {
      panelScroll.set(panelKey, panel.scrollTop);
      stopMedia(true);
      contactVisual?.pause();
      panelKey = '';
      closeTimer = setTimeout(() => {
        if (!panelNames.has(state.route.name)) {
          disposeContactVisual();
          panelBody.replaceChildren();
        }
      }, reducedMotion.matches ? 0 : 420);
    }
    const galleryFooter = name === 'projects' && galleryMode === 'gallery';
    const recordFooter = name === 'record' && galleryMode === 'machine';
    const visible = galleryFooter || recordFooter;
    footer.dataset.visible = String(visible);
    footer.dataset.mode = galleryFooter ? 'gallery' : 'record';
    footer.inert = !visible;
    footer.setAttribute('aria-hidden', String(!visible));
    const nextFooterKey = `${name}:${projectIndex}`;
    if (nextFooterKey !== footerKey) {
      recordGlass?.dispose();
      recordGlass = null;
      contextActions.replaceChildren();
      if (name === 'record') {
        const isAbout = records[projectIndex]?.destination === 'about';
        const viewProject = button(isAbout ? 'ABOUT' : 'VIEW PROJECT', onRecordOpen, 'right');
        viewProject.setAttribute('aria-label', isAbout ? 'View About' : 'View project');
        contextActions.append(viewProject);
        recordGlass = createGlassSurface(viewProject);
      }
      footerKey = nextFooterKey;
    }
    if (name !== 'projects' || currentIndex < 0) setGalleryIndex(projectIndex);
  }

  return {
    render,
    setGalleryIndex,
    setGalleryPreview,
    focusGalleryPreview() {
      if (!activePreview || preview.inert) return false;
      previewButton.focus({preventScroll: true});
      return true;
    },
    getElement: () => root,
    dispose() {
      disposed = true;
      clearTimeout(closeTimer);
      stopMedia(true);
      disposeContactVisual();
      previewGlass.dispose();
      recordGlass?.dispose();
      onPreviewHold(false);
      window.removeEventListener('pointerup', finishPreviewGesture, true);
      window.removeEventListener('pointercancel', finishPreviewGesture, true);
      document.removeEventListener('visibilitychange', visibility);
      root.remove();
    },
  };
}
