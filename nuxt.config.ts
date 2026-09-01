// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineOrganization } from 'nuxt-schema-org/schema'

export default defineNuxtConfig({
  compatibilityDate: '2025-05-31',
  devtools: { enabled: true },

  future: {
    compatibilityVersion: 4,
  },

  sourcemap: {
    client: true,
    server: true
  },

  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxt/test-utils',
    '@vueuse/nuxt',
    '@nuxthub/core',
    '@nuxtjs/seo'
  ],

  css: ['~/assets/css/main.css', process.env.NUXT_ADOBE_KIT_ID && '~/assets/css/adobe-fonts.css'],

  runtimeConfig: {
    googleApiKey: process.env.NUXT_GOOGLE_API_KEY,
    googleProgrammableSearchEngineId: process.env.NUXT_GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID,
    appleMapkitTeamId: process.env.NUXT_APPLE_MAPKIT_TEAM_ID,
    appleMapkitKeyId: process.env.NUXT_APPLE_MAPKIT_KEY_ID,
    appleMapkitPrivateKey: process.env.NUXT_APPLE_MAPKIT_PRIVATE_KEY,
    public: {
      googleApiKey: process.env.NUXT_PUBLIC_GOOGLE_API_KEY,
      posthogPublicKey: process.env.NUXT_PUBLIC_POSTHOG_PUBLIC_KEY,
    }
  },

  routeRules: {
    '/ingest/static/**': { proxy: 'https://us-assets.i.posthog.com/static/**' },
    '/ingest/**': { proxy: 'https://us.i.posthog.com/**' },
  },

  hub: {
    workers: true,
    cache: true,
    database: true,
    browser: true,
    ai: true
  },

  nitro: {
    experimental: {
      openAPI: true
    }
  },

  site: {
    url: 'https://visimate.au/',
    name: 'Listwell — Get seen online',
    description: 'Get free, step-by-step fixes in under 2 minutes to improve your online visibility.',
    defaultLocale: 'en-au',
  },

  schemaOrg: {
    identity: defineOrganization({
      name: 'Listwell',
      alternateName: 'Listwell',
      description: 'A free online visibility tool to help you get seen online.',
      logo: '/logo.png',
      url: 'https://visimate.au/',
    })
  },

  // For nicer looking fonts, add an Adobe Fonts kit ID to your .env file
  fonts: process.env.NUXT_ADOBE_KIT_ID ? {
     adobe: {
      id: [process.env.NUXT_ADOBE_KIT_ID || ''], 
    },
    
    families: [
      {
        name: 'ArponaSans',
        provider: 'adobe',
        weights: [700],
        styles: ['normal'],
      },
      {
        name: 'Darkmode Off',
        provider: 'adobe',
        weights: [400, 500, 700],
        styles: ['normal', 'italic'],
      },
      {
        name: 'Darkmode On',
        provider: 'adobe',
        weights: [400, 500, 700],
        styles: ['normal', 'italic'],
      }
    ]
  }: {
    families: [
      {
        name: 'Poppins',
        weights: [700],
        styles: ['normal'],
      },
      {
        name: 'Inter',
        weights: [400, 500, 700],
        styles: ['normal', 'italic'],
      },
    ]
  },

  image: {
    provider: 'cloudflare',
    cloudflare: {
      baseURL: 'https://visimate.au'
    }
  }
})