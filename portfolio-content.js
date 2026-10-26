// Fill these fields when your final works are ready. Empty fields are omitted.
// For media, use new URL('./assets/projects/01/film.mp4', import.meta.url).href.
// This works in source preview and lets the build embed local files for offline use.
const recordArtworks = [
  new URL('./assets/cd-drafts/01.10ca5c1cd0.webp', import.meta.url).href,
  new URL('./assets/cd-drafts/02.51982ff28d.webp', import.meta.url).href,
  new URL('./assets/cd-drafts/03.13dac42af4.webp', import.meta.url).href,
  new URL('./assets/cd-drafts/04.19c727d043.webp', import.meta.url).href,
  new URL('./assets/cd-drafts/05.7a6aace9dc.webp', import.meta.url).href,
  new URL('./assets/cd-drafts/06.7e23a56ab6.webp', import.meta.url).href,
];

const projects = recordArtworks.map((recordArtwork, index) => ({
    id: String(index + 1).padStart(2, '0'),
    title: '',
    template: true, // Set false when this project's real content is ready; hides all guidance/placeholders.
    category: '',
    year: '',
    role: '',
    tools: '',
    description: '',
    overview: '',
    process: '',
    outcome: '',
    processImages: [], // Same image format as images; displayed in a two-column process section.
    recordArtwork,
    blackVinyl: index === 1 || index === 2,
    mainVisual: null,
    detailLayout: '',
    previewVideo: '',
    video: '',
    poster: '',
    images: [], // A path string, or { src: './assets/...', alt: '...' }.
}));

export const portfolioContent = {
  profile: {
    name: 'fafa',
    disciplines: ['Creative development', 'Motion', '3D Modeling'],
    bio: '',
    email: 'qinghuawu1124@163.com',
    links: [{
      platform: '小红书',
      label: '发发华',
      url: 'https://www.xiaohongshu.com/user/profile/5a34bf6ce8ac2b04e0d4764b?xsec_token=ABifzHNwTHX0UICjJ8VCIzigxX6k7EeviYs7ESSQX7WPE%3D&xsec_source=pc_search',
    }],
  },
  projects,
  records: [{id: 'about', title: 'About', destination: 'about', original: true}, ...projects],
};
