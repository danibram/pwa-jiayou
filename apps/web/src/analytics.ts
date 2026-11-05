import posthog from 'posthog-js';

const PROJECT_TOKEN = 'phc_vWPtVkYEAUmeRNLqtmsac23SguSjwk3mSADNDiwxKm8U';

export function initAnalytics() {
  if (!import.meta.env.PROD) return;

  posthog.init(PROJECT_TOKEN, {
    api_host: 'https://eu.i.posthog.com',
    cookieless_mode: 'always',
    person_profiles: 'never',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: true,
    disable_session_recording: true,
  });
  posthog.capture('$pageview');
}

export function captureScreen(page: string) {
  if (import.meta.env.PROD) posthog.capture('screen_view', { screen: page });
}
