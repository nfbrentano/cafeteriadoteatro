// CAF-000117 / CAF-000132: Inicialização do Google Analytics com Consent Mode v2 (LGPD)
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;

// Consent Mode v2: default denied por padrão, respeitando escolha prévia em localStorage
let consentStatus = 'denied';
try {
  if (typeof localStorage !== 'undefined') {
    const salvo = localStorage.getItem('cafeteria_consent_analytics');
    if (salvo === 'granted') {
      consentStatus = 'granted';
    }
  }
} catch (e) {
  // Ignora se localStorage estiver inacessível
}

gtag('consent', 'default', {
  'analytics_storage': consentStatus,
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied'
});

gtag('js', new Date());
gtag('config', 'G-DWC0E8ZFJ5');
