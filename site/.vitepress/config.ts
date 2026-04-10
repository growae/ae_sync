import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'ae_sync',
  description: 'Contract indexing framework for Aeternity',
  cleanUrls: true,
  themeConfig: {
    sidebar: [
      {
        text: 'Getting Started',
        items: [{ text: 'Introduction', link: '/' }],
      },
    ],
  },
})
