const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(__dirname, '.visual-smoke');
const openWindows = [];

const login = async username => {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ TenDangNhap: username, MatKhau: '123' })
  });
  if (!response.ok) throw new Error(`Không đăng nhập được ${username}`);
  return response.json();
};

const inspectRolePage = async (username, target) => {
  const session = await login(username);
  const window = new BrowserWindow({ width: 1920, height: 1080, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  openWindows.push(window);
  await window.loadFile(path.join(__dirname, 'src', 'pages', 'login', 'login.html'));
  await window.webContents.executeJavaScript(`localStorage.setItem('fly_token', ${JSON.stringify(session.token)}); localStorage.setItem('fly_user', ${JSON.stringify(JSON.stringify(session.user))});`);
  await window.loadFile(path.join(__dirname, 'src', 'pages', 'dashboard', 'dashboard.html'));
  await new Promise(resolve => setTimeout(resolve, 1600));
  const clicked = await window.webContents.executeJavaScript(`(() => { const link=document.querySelector('[data-target="${target}"]'); if(!link) return false; link.click(); return true; })()`);
  if (!clicked) throw new Error(`Không tìm thấy menu ${target}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  const metrics = await window.webContents.executeJavaScript(`(() => { const body=document.body; const content=document.querySelector('.content-area'); const page=document.querySelector('.warehouse-page'); const rect=page?.getBoundingClientRect(); return { title:document.title, viewport:innerWidth, bodyWidth:body.scrollWidth, contentWidth:content?.clientWidth, pageLeft:rect ? Math.round(rect.left-content.getBoundingClientRect().left) : null, pageRight:rect ? Math.round(content.getBoundingClientRect().right-rect.right) : null, pageWidth:rect ? Math.round(rect.width) : null, tableRows:page?.querySelectorAll('tbody tr').length || 0, toast:document.querySelector('#appToast')?.textContent || '', text:(page?.innerText||'').slice(0,240) }; })()`);
  const image = await window.webContents.capturePage();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `${username}-${target}.png`), image.toPNG());
  if (target === 'purchasing-orders') {
    metrics.listActions = await window.webContents.executeJavaScript(`(() => [...document.querySelectorAll('.purchase-order-actions button')].map(button=>({ text:button.innerText, width:Math.round(button.getBoundingClientRect().width), height:Math.round(button.getBoundingClientRect().height), wrapped:button.scrollHeight>button.clientHeight+1 })))()`);
    metrics.listLayout = await window.webContents.executeJavaScript(`(() => { const row=document.querySelector('#orderBody tr'); const pill=row?.querySelector('.status-pill'); const actions=row?.querySelector('.purchase-order-actions'); if(!pill||!actions) return null; const p=pill.getBoundingClientRect(),a=actions.getBoundingClientRect(); return { statusRight:Math.round(p.right), actionsLeft:Math.round(a.left), gap:Math.round(a.left-p.right), overlaps:p.right>a.left }; })()`);
    const detailOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('[data-view-order]'); if(!button) return false; button.click(); return true; })()`);
    if (detailOpened) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const printOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('.print-order'); if(!button) return false; button.click(); return true; })()`);
      if (printOpened) {
        await new Promise(resolve => setTimeout(resolve, 500));
        metrics.orderPrint = await window.webContents.executeJavaScript(`(() => { const shell=document.querySelector('.document-preview-shell'); const frame=shell?.querySelector('iframe'); return { visible:!!shell, frameText:(frame?.contentDocument?.body?.innerText||'').slice(0,180) }; })()`);
        const printImage = await window.webContents.capturePage(); fs.writeFileSync(path.join(outputDir, `${username}-${target}-print.png`), printImage.toPNG());
        await window.webContents.executeJavaScript(`document.querySelector('.close-preview')?.click(); document.querySelector('.order-detail-modal .close')?.click()`);
      }
    }
    const opened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('[data-edit-order]'); if(!button) return false; button.click(); return true; })()`);
    if (opened) {
      await new Promise(resolve => setTimeout(resolve, 700));
      const modalMetrics = await window.webContents.executeJavaScript(`(() => { const modal=document.querySelector('.order-edit-modal'); const actions=document.querySelector('.order-edit-actions'); const rows=[...document.querySelectorAll('.order-edit-lines .warehouse-order-line[data-product]')]; return { modalVisible:!!modal, modalWidth:modal ? Math.round(modal.getBoundingClientRect().width) : 0, modalHeight:modal ? Math.round(modal.getBoundingClientRect().height) : 0, sourceButton:!!document.querySelector('.return-source'), maxValues:rows.slice(0,3).map(row=>row.dataset.max), actionWidth:actions ? Math.round(actions.getBoundingClientRect().width) : 0 }; })()`);
      Object.assign(metrics, { editModal: modalMetrics });
      const modalImage = await window.webContents.capturePage();
      fs.writeFileSync(path.join(outputDir, `${username}-${target}-edit-modal.png`), modalImage.toPNG());
      metrics.invalidQuantity = await window.webContents.executeJavaScript(`(() => { const input=document.querySelector('.order-edit-lines .order-qty'); if(!input) return null; input.value='35'; input.dispatchEvent(new Event('input',{bubbles:true})); const row=input.closest('.warehouse-order-line'); return { marked:row.classList.contains('line-invalid'), ariaInvalid:input.getAttribute('aria-invalid'), message:row.querySelector('.qty-error')?.textContent || '' }; })()`);
    }
  }
  if (target === 'warehouse-requests') {
    metrics.requestActions = await window.webContents.executeJavaScript(`(() => [...document.querySelectorAll('.warehouse-request-actions button')].map(button=>({ text:button.innerText, width:Math.round(button.getBoundingClientRect().width), height:Math.round(button.getBoundingClientRect().height), wrapped:button.scrollHeight>button.clientHeight+1 })))()`);
    metrics.requestLayout = await window.webContents.executeJavaScript(`(() => { const row=document.querySelector('#requestBody tr'); const pill=row?.querySelector('.status-pill'); const actions=row?.querySelector('.warehouse-request-actions'); if(!pill||!actions) return null; const p=pill.getBoundingClientRect(),a=actions.getBoundingClientRect(); return { statusRight:Math.round(p.right), actionsLeft:Math.round(a.left), gap:Math.round(a.left-p.right), overlaps:p.right>a.left }; })()`);
    const detailOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('[data-view]'); if(!button) return false; button.click(); return true; })()`);
    if (detailOpened) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const printOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('.print-request'); if(!button) return false; button.click(); return true; })()`);
      if (printOpened) {
        await new Promise(resolve => setTimeout(resolve, 500));
        metrics.requestPrint = await window.webContents.executeJavaScript(`(() => { const shell=document.querySelector('.document-preview-shell'); const frame=shell?.querySelector('iframe'); return { visible:!!shell, frameText:(frame?.contentDocument?.body?.innerText||'').slice(0,180) }; })()`);
        const printImage = await window.webContents.capturePage(); fs.writeFileSync(path.join(outputDir, `${username}-${target}-print.png`), printImage.toPNG());
        await window.webContents.executeJavaScript(`document.querySelector('.close-preview')?.click(); document.querySelector('.warehouse-modal .modal-close')?.click()`);
      }
    }
  }
  if (target === 'warehouse-receipts') {
    const detailOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('[data-view-receipt]'); if(!button) return false; button.click(); return true; })()`);
    if (detailOpened) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const printOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('.print-receipt'); if(!button) return false; button.click(); return true; })()`);
      if (printOpened) {
        await new Promise(resolve => setTimeout(resolve, 500));
        metrics.receiptPrint = await window.webContents.executeJavaScript(`(() => { const shell=document.querySelector('.document-preview-shell'); const frame=shell?.querySelector('iframe'); return { visible:!!shell, frameText:(frame?.contentDocument?.body?.innerText||'').slice(0,180) }; })()`);
        const printImage = await window.webContents.capturePage(); fs.writeFileSync(path.join(outputDir, `${username}-${target}-print.png`), printImage.toPNG());
      }
    }
  }
  if (target === 'accounting-invoices') {
    const opened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('#newInvoice'); if(!button) return false; button.click(); return true; })()`);
    if (opened) {
      await new Promise(resolve => setTimeout(resolve, 700));
      metrics.invoiceModal = await window.webContents.executeJavaScript(`(() => { const modal=document.querySelector('.receipt-modal'); return { visible:!!modal, width:modal ? Math.round(modal.getBoundingClientRect().width) : 0, height:modal ? Math.round(modal.getBoundingClientRect().height) : 0, choices:document.querySelectorAll('.accounting-intake-choice label').length, text:(modal?.innerText||'').slice(0,180) }; })()`);
      const modalImage = await window.webContents.capturePage();
      fs.writeFileSync(path.join(outputDir, `${username}-${target}-invoice-modal.png`), modalImage.toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('.receipt-modal .close')?.click()`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const reconciliationOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('[data-reconcile]'); if(!button) return false; button.click(); return true; })()`);
    if (reconciliationOpened) {
      await new Promise(resolve => setTimeout(resolve, 900));
      metrics.reconciliationModal = await window.webContents.executeJavaScript(`(() => { const modal=document.querySelector('.accounting-reconcile-modal'); const table=modal?.querySelector('.accounting-reconcile-table'); const action=modal?.querySelector('.reconcile'); return { visible:!!modal, width:modal ? Math.round(modal.getBoundingClientRect().width) : 0, height:modal ? Math.round(modal.getBoundingClientRect().height) : 0, threeDocuments:modal?.querySelectorAll('.accounting-document-strip article').length || 0, rows:table?.querySelectorAll('tbody tr').length || 0, confirmEnabled:action ? !action.disabled : false, text:(modal?.innerText||'').slice(0,240) }; })()`);
      const reconciliationImage = await window.webContents.capturePage();
      fs.writeFileSync(path.join(outputDir, `${username}-${target}-reconciliation-modal.png`), reconciliationImage.toPNG());
      const printOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('.print-reconciliation'); if(!button||button.disabled) return false; button.click(); return true; })()`);
      if (printOpened) {
        await new Promise(resolve => setTimeout(resolve, 500));
        metrics.reconciliationPrint = await window.webContents.executeJavaScript(`(() => { const shell=document.querySelector('.document-preview-shell'); const frame=shell?.querySelector('iframe'); return { visible:!!shell, frameText:(frame?.contentDocument?.body?.innerText||'').slice(0,180) }; })()`);
        const printImage = await window.webContents.capturePage(); fs.writeFileSync(path.join(outputDir, `${username}-${target}-reconciliation-print.png`), printImage.toPNG());
      }
    }
  }
  if (target === 'manager-payables') {
    metrics.managerPayables = await window.webContents.executeJavaScript(`(() => ({
      total:document.querySelector('#managerDebtTotal')?.textContent || '',
      remaining:document.querySelector('#managerDebtRemaining')?.textContent || '',
      rows:document.querySelectorAll('#managerDebtBody tr').length,
      tableViewport:document.querySelector('.manager-debt-card .warehouse-table-wrap')?.clientWidth || 0,
      tableContent:document.querySelector('.manager-debt-card .warehouse-table-wrap')?.scrollWidth || 0,
      headerFont:document.querySelector('.manager-debt-table th') ? getComputedStyle(document.querySelector('.manager-debt-table th')).fontFamily : '',
      bodyFont:document.querySelector('.manager-debt-table td') ? getComputedStyle(document.querySelector('.manager-debt-table td')).fontFamily : '',
      actions:[...document.querySelectorAll('[data-manager-debt]')].map(button=>({text:button.innerText,width:Math.round(button.getBoundingClientRect().width),wrapped:button.scrollHeight>button.clientHeight+1}))
    }))()`);
    if (metrics.managerPayables.tableContent > metrics.managerPayables.tableViewport + 1) throw new Error(`manager-payables còn cuộn ngang: ${metrics.managerPayables.tableContent}/${metrics.managerPayables.tableViewport}`);
    const detailOpened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('[data-manager-debt]'); if(!button) return false; button.click(); return true; })()`);
    if (detailOpened) {
      await new Promise(resolve => setTimeout(resolve, 500));
      metrics.managerPayableDetail = await window.webContents.executeJavaScript(`(() => { const modal=document.querySelector('.manager-payable-modal'); return {visible:!!modal,width:modal?Math.round(modal.getBoundingClientRect().width):0,text:(modal?.innerText||'').slice(0,220)}; })()`);
      const detailImage = await window.webContents.capturePage();
      fs.writeFileSync(path.join(outputDir, `${username}-${target}-detail.png`), detailImage.toPNG());
    }
  }
  if (target === 'cashier-shifts') {
    const opened = await window.webContents.executeJavaScript(`(() => { const button=document.querySelector('#openShift'); if(!button) return false; button.click(); return true; })()`);
    if (opened) {
      await new Promise(resolve => setTimeout(resolve, 400));
      metrics.openShiftModal = await window.webContents.executeJavaScript(`(() => { const modal=document.querySelector('.warehouse-confirm-modal'); return { visible:!!modal, width:modal ? Math.round(modal.getBoundingClientRect().width) : 0, text:(modal?.innerText||'').slice(0,180) }; })()`);
      const modalImage = await window.webContents.capturePage();
      fs.writeFileSync(path.join(outputDir, `${username}-${target}-open-modal.png`), modalImage.toPNG());
    }
  }
  if (metrics.bodyWidth > metrics.viewport + 2) throw new Error(`${target} bị tràn ngang toàn trang: ${metrics.bodyWidth}/${metrics.viewport}`);
  if (metrics.pageLeft > 32 || metrics.pageRight > 32) throw new Error(`${target} đang bị thu hẹp hai bên: trái ${metrics.pageLeft}px, phải ${metrics.pageRight}px`);
  return { username, target, ...metrics };
};

app.whenReady().then(async () => {
  try {
    const results = [];
    results.push(await inspectRolePage('thukho', 'warehouse-receiving'));
    results.push(await inspectRolePage('thukho', 'warehouse-requests'));
    results.push(await inspectRolePage('thukho', 'warehouse-receipts'));
    results.push(await inspectRolePage('muahang', 'purchasing-inbox'));
    results.push(await inspectRolePage('muahang', 'purchasing-orders'));
    results.push(await inspectRolePage('ketoan', 'accounting-invoices'));
    results.push(await inspectRolePage('admin', 'manager-purchase-approvals'));
    results.push(await inspectRolePage('admin', 'manager-payables'));
    results.push(await inspectRolePage('thungan', 'cashier-shifts'));
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    openWindows.forEach(window => window.destroy());
    app.exit(0);
  } catch (error) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'error.txt'), error.stack || String(error));
    console.error(error);
    openWindows.forEach(window => window.destroy());
    app.exit(1);
  }
});
