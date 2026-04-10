import { defineConfig } from 'vitepress'
import type { DefaultTheme } from 'vitepress'

export default defineConfig({
  title: 'aesync',
  description: 'Contract indexing framework for Aeternity',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['meta', { property: 'og:title', content: 'aesync' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Contract indexing framework for Aeternity',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['link', { rel: 'stylesheet', href: '/styles/custom.css' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/api/createConfig' },
      { text: 'Examples', link: '/examples/dex-indexer' },
    ],

    sidebar: {
      '/': mainSidebar(),
    },

    outline: [2, 3],

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/growae/ae_sync' },
    ],

    editLink: {
      pattern: 'https://github.com/growae/ae_sync/edit/main/site/:path',
      text: 'Suggest changes to this page',
    },

    footer: {
      message:
        'Released under the <a href="https://github.com/growae/ae_sync/blob/main/LICENSE">MIT License</a>.',
    },
  },
})

function mainSidebar(): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'Introduction',
      items: [
        { text: 'Getting Started', link: '/getting-started' },
        { text: 'Installation', link: '/installation' },
      ],
    },
    {
      text: 'Guides',
      items: [
        { text: 'Contracts', link: '/guides/contracts' },
        { text: 'Schemas', link: '/guides/schemas' },
        { text: 'Event Handlers', link: '/guides/event-handlers' },
        { text: 'API Routes', link: '/guides/api-routes' },
        { text: 'Factory Contracts', link: '/guides/factory-contracts' },
        { text: 'Docker', link: '/guides/docker' },
        { text: 'ae_mdw Integration', link: '/guides/ae-mdw' },
      ],
    },
    {
      text: 'API Reference',
      items: [
        { text: 'createConfig', link: '/api/createConfig' },
        { text: 'onchainTable', link: '/api/onchainTable' },
        { text: 'GraphQL', link: '/api/graphql' },
      ],
    },
    {
      text: 'CLI',
      items: [
        { text: 'aesync dev', link: '/api/cli/dev' },
        { text: 'aesync start', link: '/api/cli/start' },
        { text: 'aesync serve', link: '/api/cli/serve' },
        { text: 'aesync codegen', link: '/api/cli/codegen' },
      ],
    },
    {
      text: 'Examples',
      items: [{ text: 'DEX Indexer', link: '/examples/dex-indexer' }],
    },
    {
      text: 'Advanced',
      items: [{ text: 'Architecture', link: '/advanced/architecture' }],
    },
  ]
}
