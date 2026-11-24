import globals from 'globals';

const localPlugin = {
  rules: {
    'no-bare-supabase-client': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Proíbe window.supabaseClient sem fallback para cafeteriaSupabase (CAF-000130)'
        }
      },
      create(context) {
        return {
          MemberExpression(node) {
            if (
              (node.object.name === 'window' || node.object.name === 'globalThis') &&
              node.property.name === 'supabaseClient'
            ) {
              const parent = node.parent;
              const isFallback =
                parent &&
                parent.type === 'LogicalExpression' &&
                parent.operator === '||' &&
                parent.right === node &&
                ((parent.left.type === 'MemberExpression' &&
                  parent.left.property?.name === 'cafeteriaSupabase') ||
                 (parent.left.type === 'Identifier' &&
                  parent.left.name === 'cafeteriaSupabase'));
              if (!isFallback) {
                context.report({
                  node,
                  message: 'Uso de window.supabaseClient sem fallback para cafeteriaSupabase é proibido.'
                });
              }
            }
          }
        };
      }
    }
  }
};

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.e2e-data/**',
      'js/libs/**',
      'js/vendor/**'
    ]
  },
  {
    files: ['e2e/**/*.js', 'playwright.config.js', 'scripts/e2e-*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_'
      }]
    }
  },
  {
    files: ['js/**/*.js'],
    plugins: {
      local: localPlugin
    },
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
      'local/no-bare-supabase-client': 'error',
      'no-unused-vars': ['warn', {
        args: 'none',
        caughtErrors: 'none',
        varsIgnorePattern: '^_'
      }],
      'no-implicit-globals': 'off'
    }
  }
];
