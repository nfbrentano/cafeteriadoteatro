import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'js/libs/**',
      'js/vendor/**'
    ]
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
        process: 'readonly',
        global: 'readonly',
        supabase: 'readonly',
        Chart: 'readonly',
        QRCode: 'readonly',
        qrcode: 'readonly',
        pdfjsLib: 'readonly',
        PageFlip: 'readonly',
        St: 'readonly',
        gtag: 'readonly',
        dataLayer: 'writable',
        Html5Qrcode: 'readonly',
        cafeteriaDB: 'readonly',
        cafeteriaSupabase: 'readonly',
        supabaseClient: 'readonly',
        cafeteriaAdmin: 'readonly',
        PixBRCode: 'readonly',
        SUPABASE_URL: 'readonly',
        SUPABASE_ANON_KEY: 'readonly',
        showToast: 'readonly',
        showConfirm: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_'
      }],
      'no-implicit-globals': 'off'
    }
  }
];
