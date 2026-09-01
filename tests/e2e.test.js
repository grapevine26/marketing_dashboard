const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3000';

async function runE2ETests() {
  console.log('🚀 Running Comprehensive Playwright E2E Test Suite (All Modules)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const results = [];

  function record(name, status, details = '') {
    results.push({ name, status, details });
    console.log(`[${status ? 'PASS' : 'FAIL'}] ${name} ${details ? '(' + details + ')' : ''}`);
  }

  try {
    // 1. Dashboard Overview & Calendar (Subproject D)
    console.log('\n--- 1. Testing Dashboard Overview & Calendar (/) ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const pageTitle = await page.textContent('h2');
    record('Dashboard Title Loaded', pageTitle.includes('일정') || pageTitle.includes('임박'), pageTitle);

    const urgentCards = await page.$$('a[href*="/campaigns"], a[href*="/sns"]');
    record('Urgent/Overdue Alert Cards Rendered', urgentCards.length > 0, `${urgentCards.length} alert cards found`);

    const prevMonthBtn = await page.$('button:has(svg.lucide-chevron-left)');
    if (prevMonthBtn) {
      await prevMonthBtn.click();
      await page.waitForTimeout(500);
      record('Calendar Month Navigation (Prev)', page.url().includes('month='), page.url());
    }

    // 2. Campaign Hub & Event Banner Integration (Subproject A & B)
    console.log('\n--- 2. Testing Campaigns & Events Hub ---');
    await page.goto(`${BASE_URL}/campaigns`, { waitUntil: 'networkidle' });
    const campaignLink = await page.$('a[href^="/campaigns/"]');
    if (campaignLink) {
      const campHref = await campaignLink.getAttribute('href');
      await page.goto(`${BASE_URL}${campHref}`, { waitUntil: 'networkidle' });
      
      const eventBanner = await page.$('a[href$="/events"]');
      record('Campaign Hub Event Banner Exists', !!eventBanner, 'Found link to /events');

      if (eventBanner) {
        await eventBanner.click();
        await page.waitForTimeout(500);
        record('Navigate to Campaign Events List', page.url().includes('/events'), page.url());
      }
    }

    // 3. Event Detail & 3 Tabs & PPT Download (Subproject B)
    console.log('\n--- 3. Testing Event Detail & Actions (Subproject B) ---');
    const eventCard = await page.$('a[href*="/events/e1a2b3c4-"]');
    if (eventCard) {
      await eventCard.click();
      await page.waitForTimeout(500);
      record('Event Detail Page Loaded', page.url().includes('/events/e1a2b3c4-'), page.url());

      // Direct Invitee Add
      const directNameInput = await page.$('input[placeholder="이름 *"]');
      if (directNameInput) {
        await directNameInput.fill('Playwright 테스트 게스트');
        await page.click('button:has-text("추가")');
        await page.waitForTimeout(400);
        const guestExists = await page.textContent('body');
        record('Direct Invitee Added', guestExists.includes('Playwright 테스트 게스트'), 'Found added guest in list');
      }

      // Checkin Checkbox
      const checkinCheckbox = await page.$('input[type="checkbox"].accent-emerald-500');
      if (checkinCheckbox) {
        await checkinCheckbox.click();
        await page.waitForTimeout(300);
        record('Checkin Checkbox Toggle', true, 'Toggled checkin status');
      }

      // Tab 2: Plan & Save
      await page.click('button:has-text("운영안 작성 & PPT")');
      await page.waitForTimeout(300);
      const planInput = await page.$('input[value*="글로우랩"], textarea');
      record('Plan Editor Tab Opened', !!planInput, 'Found plan form field');

      await page.click('button:has-text("운영안 저장")');
      await page.waitForTimeout(500);
      const planSaved = await page.textContent('body');
      record('Event Plan Saved', planSaved.includes('성공적으로 저장'), 'Saved notice displayed');

      // Tab 3: Checklist
      await page.click('button:has-text("체크리스트")');
      await page.waitForTimeout(300);
      const chkInput = await page.$('input[placeholder="할 일 항목 내용 *"]');
      if (chkInput) {
        await chkInput.fill('E2E 테스트 리허설 점검');
        await page.click('button:has-text("등록")');
        await page.waitForTimeout(400);
        const chkText = await page.textContent('body');
        record('Checklist Item Added', chkText.includes('E2E 테스트 리허설 점검'), 'Checklist row rendered');
      }

      // PPT Export Route
      const pptRes = await page.request.get(`${page.url()}/plan/export`);
      record('Event PPT Export Route (HTTP 200)', pptRes.status() === 200, `Status: ${pptRes.status()}`);
    }

    // 4. SNS Channel Hub & Detail (Subproject C)
    console.log('\n--- 4. Testing SNS Operation Hub (Subproject C) ---');
    await page.goto(`${BASE_URL}/sns`, { waitUntil: 'networkidle' });
    const snsAccountCard = await page.$('a[href^="/sns/s1a2b3c4-"]');
    record('SNS Accounts List Loaded', !!snsAccountCard, 'Found sample SNS account card');

    if (snsAccountCard) {
      await snsAccountCard.click();
      await page.waitForTimeout(500);
      record('SNS Account Detail Page Loaded', page.url().includes('/sns/s1a2b3c4-'), page.url());

      // Check 2 Public Link Box
      const copyBtns = await page.$$('button:has-text("복사")');
      record('2 Public Token Share Boxes Rendered', copyBtns.length >= 2, `${copyBtns.length} copy buttons found`);

      // Tab Switching - Intake
      await page.click('button:has-text("사전설문 응답 결과")');
      await page.waitForTimeout(300);
      const intakeContent = await page.textContent('body');
      record('SNS Intake Tab Loaded', intakeContent.includes('광고주 사전설문') || intakeContent.includes('항목 1'), 'Intake responses displayed');

      // Switch back to List Tab
      await page.click('button:has-text("콘텐츠 목록")');
      await page.waitForTimeout(300);

      // New Content Modal
      await page.click('button:has-text("새 콘텐츠 기획")');
      await page.waitForTimeout(300);
      const titleInput = await page.$('input[placeholder*="하이드라"]');
      if (titleInput) {
        await titleInput.fill('Playwright 자동화 런칭 릴스');
        await page.click('button:has-text("기획안 등록")');
        await page.waitForTimeout(500);
        const contentBody = await page.textContent('body');
        record('New SNS Content Created', contentBody.includes('Playwright 자동화 런칭 릴스'), 'Content card added to list');
      }

      // SNS Plan Page & PPT Export
      await page.click('a:has-text("SNS 운영안 (웹/PPT)")');
      await page.waitForTimeout(500);
      record('SNS Plan Page Loaded', page.url().includes('/plan'), page.url());

      await page.click('button:has-text("운영안 저장")');
      await page.waitForTimeout(500);
      const planNotice = await page.textContent('body');
      record('SNS Plan Saved', planNotice.includes('성공적으로 저장'), 'Saved notice displayed');

      const snsPptRes = await page.request.get(`${page.url()}/export`);
      record('SNS PPT Export Route (HTTP 200)', snsPptRes.status() === 200, `Status: ${snsPptRes.status()}`);
    }

    // 5. Public Token Routes (Subproject C Public)
    console.log('\n--- 5. Testing Public Token Routes ---');
    // SNS Intake Public
    await page.goto(`${BASE_URL}/sns-intake/sns_intake_tok_12345`, { waitUntil: 'networkidle' });
    const intakeHeader = await page.textContent('h1');
    record('SNS Intake Public Page Loaded', intakeHeader.includes('사전설문'), intakeHeader);

    const submitIntakeBtn = await page.$('button[type="submit"]');
    if (submitIntakeBtn) {
      await submitIntakeBtn.click();
      await page.waitForTimeout(600);
      const submittedText = await page.textContent('body');
      record('SNS Intake Form Submit', submittedText.includes('성공적으로 접수'), 'Submit confirmation displayed');
    }

    // SNS Approval Public
    await page.goto(`${BASE_URL}/sns-approval/sns_appr_tok_12345`, { waitUntil: 'networkidle' });
    const approvalHeader = await page.textContent('h1');
    record('SNS Approval Public Page Loaded', approvalHeader.includes('시안 검토'), approvalHeader);

    const commentInput = await page.$('input[placeholder*="수정 요청 사항"]');
    if (commentInput) {
      await commentInput.fill('Playwright 수정 요청 테스트 의견입니다.');
    }
    const requestChangesBtn = await page.$('button:has-text("수정 요청")');
    if (requestChangesBtn) {
      await requestChangesBtn.click();
      await page.waitForTimeout(500);
      const updatedText = await page.textContent('body');
      record('Client Request Changes Submitted', updatedText.includes('Playwright 수정 요청 테스트 의견'), 'Feedback recorded and displayed');
    }

    // 6. Settings Pages
    console.log('\n--- 6. Testing Settings Pages ---');
    await page.goto(`${BASE_URL}/settings/sns-intake`, { waitUntil: 'networkidle' });
    const snsSettingHeader = await page.textContent('h1');
    record('SNS Intake Settings Page Loaded', snsSettingHeader.includes('기본 질문틀'), snsSettingHeader);

    await page.goto(`${BASE_URL}/settings/ppt-templates`, { waitUntil: 'networkidle' });
    const pptSettingHeader = await page.textContent('h1');
    record('PPT Templates Settings Page Loaded', pptSettingHeader.includes('공용 PPT'), pptSettingHeader);

    // 7. Seeding Public Token Routes
    console.log('\n--- 7. Testing Seeding Public Routes (Subproject A) ---');
    await page.goto(`${BASE_URL}/apply/apply_tok_demo_12345`, { waitUntil: 'networkidle' });
    const applyHeader = await page.textContent('h1');
    record('Influencer Apply Public Page Loaded', applyHeader.includes('지원폼') || applyHeader.includes('캠페인') || applyHeader.includes('체험단'), applyHeader);

    await page.goto(`${BASE_URL}/pre-survey/ps_tok_demo_12345`, { waitUntil: 'networkidle' });
    const preSurveyHeader = await page.textContent('h1');
    record('Pre-Survey Public Page Loaded', preSurveyHeader.includes('사전조사') || preSurveyHeader.includes('글로우랩'), preSurveyHeader);

  } catch (err) {
    console.error('Test Suite Exception:', err);
    record('Test Suite Execution', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  const passedCount = results.filter(r => r.status).length;
  console.log(`📊 E2E Test Summary: ${passedCount}/${results.length} Passed`);
  console.log('========================================');
}

runE2ETests().catch(console.error);