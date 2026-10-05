const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { DEFAULT_PLAN_MATRIX, calculateSubscriptionDates } = require('../src/services/subscription.service');
const { decoratePlanForDisplay } = require('../src/services/planDisplay.service');
const { signupNextUrlForPlan } = require('../src/services/signupPlan.service');

test('plan presentation clearly distinguishes the two US$10 products', () => {
  const manual = decoratePlanForDisplay(DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'manual-publisher'));
  const starter = decoratePlanForDisplay(DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'starter'));

  assert.equal(manual.priceLabel, 'US$10');
  assert.equal(starter.priceLabel, 'US$10');
  assert.equal(manual.recurringPriceLabel, 'US$10 · 1 month of access');
  assert.equal(starter.recurringPriceLabel, 'US$10 · 1 month of access');
  assert.equal(manual.aiIncluded, false);
  assert.equal(manual.aiModeLabel, 'No generative AI');
  assert.match(manual.workflowLabel, /Bring your own text and media/);
  assert.equal(starter.aiIncluded, true);
  assert.match(starter.aiModeLabel, /Generative AI included/);
  assert.match(manual.billingSummary, /manual Pesapal payment/i);
  assert.match(manual.billingSummary, /no automatic renewal/i);
});

test('Free Trial is explicit US$0 for seven days and never promises paid conversion', () => {
  const trial = decoratePlanForDisplay(DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'free-trial'));
  assert.equal(trial.name, 'Free Trial');
  assert.equal(trial.priceLabel, 'US$0 · 7 days');
  assert.equal(trial.accessPeriodLabel, '7-day trial');
  assert.match(trial.billingSummary, /no payment/i);
  assert.match(trial.billingSummary, /no automatic paid conversion/i);
});

test('new-user onboarding routes trial to setup and paid plans to exact checkout review', () => {
  const trial = DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'free-trial');
  const manual = DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'manual-publisher');
  const starter = DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'starter');

  assert.equal(signupNextUrlForPlan(trial), '/dashboard?welcome=1');
  assert.equal(signupNextUrlForPlan(manual), '/dashboard/billing/checkout/manual-publisher?onboarding=1');
  assert.equal(signupNextUrlForPlan(starter), '/dashboard/billing/checkout/starter?onboarding=1');
});

test('monthly paid access follows the activation date instead of the calendar month', () => {
  const plan = DEFAULT_PLAN_MATRIX.find((item) => item.slug === 'manual-publisher');
  const activation = new Date('2026-09-18T10:15:00.000Z');
  const dates = calculateSubscriptionDates(plan, activation);
  assert.equal(dates.currentPeriodStart.toISOString(), '2026-09-18T10:15:00.000Z');
  assert.equal(dates.currentPeriodEnd.toISOString(), '2026-10-18T10:15:00.000Z');
});

test('monthly access handles month-end activation without inventing a 30-day month', () => {
  const plan = DEFAULT_PLAN_MATRIX.find((item) => item.slug === 'starter');
  const dates = calculateSubscriptionDates(plan, new Date('2027-01-31T08:00:00.000Z'));
  assert.equal(dates.currentPeriodEnd.toISOString(), '2027-02-28T08:00:00.000Z');
});

test('trial dates remain exactly seven days from activation', () => {
  const plan = DEFAULT_PLAN_MATRIX.find((item) => item.slug === 'free-trial');
  const dates = calculateSubscriptionDates(plan, new Date('2026-09-08T12:00:00.000Z'));
  assert.equal(dates.currentPeriodEnd.toISOString(), '2026-09-15T12:00:00.000Z');
});

test('signup and Pesapal callback preserve one unified onboarding journey', () => {
  const auth = read('src/controllers/authController.js');
  const billing = read('src/controllers/billingController.js');
  const billingService = read('src/services/billing/billing.service.js');
  assert.match(auth, /planAction\.nextUrl/);
  assert.match(auth, /signupNextUrlForPlan/);
  assert.match(billingService, /metadata:[\s\S]*onboarding: Boolean\(onboarding\)/);
  assert.match(billing, /payment\.metadata\?\.onboarding[\s\S]*dashboard\?welcome=1/);
});

test('period quotas use subscription access windows rather than calendar months', () => {
  const limits = read('src/services/usageLimitService.js');
  const usage = read('src/services/usage.service.js');
  assert.match(limits, /getUsagePeriod/);
  assert.match(usage, /getUsagePeriod/);
  assert.doesNotMatch(limits, /startOfMonth/);
  assert.doesNotMatch(usage, /startOfMonth/);
});

test('public and dashboard money copy does not promise automatic recurring charging', () => {
  const landing = read('src/views/public/landing.ejs');
  const dashboard = read('public/js/dashboard-experience.js');
  const checkout = read('src/views/dashboard/pages/billing-checkout.ejs');
  for (const source of [landing, dashboard, checkout]) {
    assert.doesNotMatch(source, /renews monthly until cancelled/i);
    assert.doesNotMatch(source, /automatically renews/i);
  }
  assert.match(landing, /does not automatically charge/i);
  assert.match(dashboard, /does not automatically charge/i);
});

test('the onboarding and billing source-of-truth document is part of production docs', () => {
  const doc = read('docs/ONBOARDING-AND-BILLING.md');
  assert.match(doc, /Publish/);
  assert.match(doc, /AI Starter/);
  assert.match(doc, /US\$10/);
  assert.match(doc, /Pesapal/);
  assert.match(doc, /No automatic renewal/i);
  assert.match(doc, /access period/i);
});
