/**
 * Post-Survey PDF Report Sync exporter module
 */

export function exportPDF(project = {}, tasks = []) {
  // Support calling signature exportPDF(project, tasks) or exportPDF(tasks)
  if (Array.isArray(project)) {
    tasks = project;
    project = {};
  }

  const printableArea = window.open('', '_blank');
  if (!printableArea) {
    alert("Please allow popups to export the PDF report.");
    return;
  }

  const projTitle = project.project_name ? `${project.project_name} (${project.project_id || ''})` : 'Master Survey Report';

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const approvedCount = tasks.filter(t => (t.officerStatus || 'Pending') === 'Approved').length;
  const reviewCount = tasks.filter(t => (t.officerStatus || 'Pending') === 'Under Review').length;
  const rejectedCount = tasks.filter(t => (t.officerStatus || 'Pending') === 'Rejected').length;
  const pendingCount = tasks.filter(t => !t.officerStatus || t.officerStatus === 'Pending').length;

  const rowsHtml = tasks.map((task, idx) => {
    const status = task.officerStatus || 'Pending';
    let statusBg = '#FEF3C7';
    let statusColor = '#92400E';
    if (status === 'Approved') { statusBg = '#D1FAE5'; statusColor = '#065F46'; }
    if (status === 'Under Review') { statusBg = '#E0F2FE'; statusColor = '#075985'; }
    if (status === 'Rejected') { statusBg = '#FEE2E2'; statusColor = '#991B1B'; }

    const areaDisp = task.areaSqm ? `${Number(task.areaSqm).toLocaleString('en-IN')} sq m` : (task.areaSqKm ? `${task.areaSqKm} sq km` : '—');
    
    // Financials
    const fin = task.larr_financials || {};
    const baseRate = fin.baseCircleRate ? `₹${Number(fin.baseCircleRate).toLocaleString('en-IN')}/sq m` : '—';
    const totalAward = fin.totalAward ? `₹${Number(fin.totalAward).toLocaleString('en-IN')}` : '—';
    const assetVal = task.assetValue ? `₹${Number(task.assetValue).toLocaleString('en-IN')}` : '—';

    const isRural = task.zoneType === 'RURAL' || task.isRural || false;
    const zoneLabel = isRural ? 'Rural' : 'Urban';
    const multVal = task.larr_financials?.multiplier ?? (isRural ? 2.0 : 1.2);
    const multiplierLabel = `${multVal}x`;

    return `
      <tr style="border-bottom: 1px solid #E5E7EB; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
        <td style="padding: 10px; font-weight: bold;">
          ${task.plotId || '—'}<br/>
          <span style="font-size: 10px; font-weight: normal; color: #6B7280;">${task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Khasra: Unverified'}</span>
        </td>
        <td style="padding: 10px;">${task.surveyorOwnerName || '—'}</td>
        <td style="padding: 10px;">${task.surveyorPhone || '—'}</td>
        <td style="padding: 10px;">${task.surveyorAadhaar || '—'}</td>
        <td style="padding: 10px;">${task.verifiedLandClass || task.landCategory || '—'}</td>
        <td style="padding: 10px; font-weight: 600;">${zoneLabel}</td>
        <td style="padding: 10px; font-weight: bold; color: #2563EB;">${multiplierLabel}</td>
        <td style="padding: 10px;">${areaDisp}</td>
        <td style="padding: 10px;">${assetVal}</td>
        <td style="padding: 10px;">${baseRate}</td>
        <td style="padding: 10px; font-weight: bold; color: #047857;">${totalAward}</td>
        <td style="padding: 10px;">
          <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}40;">
            ${status}
          </span>
        </td>
        <td style="padding: 10px; font-size: 11px; color: #4B5563;">${task.officerRemarks || task.reviewRemarks || '—'}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Survey & LARR Valuation Master Report</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 30px; color: #1F2937; background: #fff; }
          .header { border-bottom: 3px solid #2563EB; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 24px; font-weight: bold; color: #1E3A8A; margin: 0; }
          .subtitle { font-size: 13px; color: #6B7280; margin-top: 4px; }
          .stats-bar { display: flex; gap: 15px; margin-bottom: 20px; background: #F3F4F6; padding: 12px 18px; border-radius: 8px; border: 1px solid #E5E7EB; }
          .stat-item { flex: 1; text-align: center; }
          .stat-value { font-size: 18px; font-weight: bold; }
          .stat-label { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th { background-color: #1E293B; color: #FFFFFF; text-align: left; padding: 10px; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
          .footer { margin-top: 40px; font-size: 11px; color: #9CA3AF; border-top: 1px solid #E5E7EB; padding-top: 15px; display: flex; justify-content: space-between; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">Municipal Officer Command Center</h1>
            <div class="subtitle">Bhoomi GIS Land Acquisition & LARR Dynamic Compensation Master Report</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #4B5563;">
            <div>Generated: <strong>${dateStr}</strong></div>
            <div>Total Plots: <strong>${tasks.length}</strong></div>
          </div>
        </div>

        <div class="stats-bar">
          <div class="stat-item">
            <div class="stat-value" style="color: #059669;">${approvedCount}</div>
            <div class="stat-label">Approved</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color: #0284C7;">${reviewCount}</div>
            <div class="stat-label">Under Review</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color: #DC2626;">${rejectedCount}</div>
            <div class="stat-label">Rejected</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color: #D97706;">${pendingCount}</div>
            <div class="stat-label">Pending Action</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Plot ID</th>
              <th>Owner Name</th>
              <th>Phone</th>
              <th>Aadhaar</th>
              <th>Category</th>
              <th>Zone Designation</th>
              <th>Applied Multiplier</th>
              <th>Measured Area</th>
              <th>Asset Value</th>
              <th>Circle Rate</th>
              <th>Sanctioned LARR Award</th>
              <th>Officer Decision</th>
              <th>Officer Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>Bhoomi GIS Portal — Offical Verification Document (RFCTLARR Act 2013)</div>
          <div>Page 1 of 1</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          }
        </script>
      </body>
    </html>
  `;

  printableArea.document.write(htmlContent);
  printableArea.document.close();
}
