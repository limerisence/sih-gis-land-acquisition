/**
 * Post-Survey PDF Report Sync exporter module
 * Supports Master Corridor Export & Individual Plot RFCTLARR Award Certificate
 */

export function exportSinglePlotPDF(task = {}, project = {}) {
  const printableArea = window.open('', '_blank');
  if (!printableArea) {
    alert("Please allow popups to export the PDF report.");
    return;
  }

  const isApproved = task.officerStatus === 'Approved' || task.status === 'Approved';
  const isUnderReview = task.officerStatus === 'Under Review' || task.status === 'Under Review';
  const isRejected = task.officerStatus === 'Rejected' || task.status === 'Rejected';
  const statusLabel = isApproved ? 'APPROVED' : isUnderReview ? 'UNDER REVIEW' : isRejected ? 'REJECTED' : 'PENDING REVIEW';

  const fin = task.larr_financials || {};
  const areaDisp = task.areaSqm ? `${Number(task.areaSqm).toLocaleString('en-IN')} sq m` : (task.areaSqKm ? `${(Number(task.areaSqKm) * 1000000).toLocaleString('en-IN')} sq m` : '—');
  const marketVal = fin.marketRate ? `₹${Number(fin.marketRate).toLocaleString('en-IN')}` : '—';
  const solatium = fin.solatium ? `₹${Number(fin.solatium).toLocaleString('en-IN')}` : '—';
  const assetVal = (task.assetValue || fin.assetValue) ? `₹${Number(task.assetValue || fin.assetValue).toLocaleString('en-IN')}` : '₹0';
  const baseRate = (task.baseCircleRateOverride || fin.baseCircleRate) ? `₹${Number(task.baseCircleRateOverride || fin.baseCircleRate).toLocaleString('en-IN')}/sq m` : '₹4,500/sq m';
  const multVal = fin.multiplier ?? ((task.zoneType === 'RURAL' || task.isRural) ? 2.0 : 1.2);
  const totalAward = fin.totalAward ? `₹${Number(fin.totalAward).toLocaleString('en-IN')}` : 'Pending Calculation';

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>RFCTLARR Sanctioned Award Certificate - ${task.plotId || 'Plot'}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 35px; color: #0f172a; background: #fff; }
          .certificate-container {
            border: ${isApproved ? '3px solid #DC2626' : '2px solid #2563EB'};
            border-radius: 12px;
            padding: 30px;
            position: relative;
            background: #ffffff;
            box-shadow: ${isApproved ? '0 0 0 4px #FEE2E2' : 'none'};
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid ${isApproved ? '#DC2626' : '#2563EB'};
            padding-bottom: 20px;
            margin-bottom: 25px;
          }
          .title { font-size: 22px; font-weight: 800; color: ${isApproved ? '#991B1B' : '#1E3A8A'}; margin: 0; }
          .subtitle { font-size: 13px; color: #475569; margin-top: 4px; }
          .badge {
            display: inline-block;
            padding: 6px 16px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            ${isApproved
              ? 'background-color: #FEF2F2; color: #DC2626; border: 2px solid #DC2626;'
              : isUnderReview
              ? 'background-color: #FEF3C7; color: #B45309; border: 2px solid #D97706;'
              : isRejected
              ? 'background-color: #FEE2E2; color: #991B1B; border: 2px solid #DC2626;'
              : 'background-color: #F1F5F9; color: #475569; border: 2px solid #94A3B8;'}
          }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
          .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #f1f5f9; }
          .row-label { color: #64748b; font-weight: 500; }
          .row-val { font-weight: 700; color: #0f172a; }
          .award-box {
            background: ${isApproved ? '#FEF2F2' : '#F0FDF4'};
            border: 2px solid ${isApproved ? '#DC2626' : '#16A34A'};
            border-radius: 8px;
            padding: 18px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 25px 0;
          }
          .award-amount { font-size: 26px; font-weight: 900; color: ${isApproved ? '#B91C1C' : '#15803D'}; font-family: monospace; }
          .remarks-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 30px; font-size: 13px; }
          .footer-sign { display: flex; justify-content: space-between; margin-top: 50px; font-size: 12px; color: #475569; }
          .sign-line { border-top: 1px solid #0f172a; width: 200px; padding-top: 6px; text-align: center; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="certificate-container">
          <div class="header">
            <div>
              <h1 class="title">BHOOMI GIS LAND ACQUISITION & RFCTLARR VALUATION</h1>
              <div class="subtitle">Competent Authority & Municipal Officer Final Sanctioned Award Certificate</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-family: monospace;">
                Project: <strong>${project.project_name || task.projectName || 'Infrastructure Corridor'}</strong> (${project.project_id || task.projectId || 'PRJ-MASTER'})
              </div>
            </div>
            <div style="text-align: right;">
              <span class="badge">${statusLabel}</span>
              <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Date: ${dateStr}</div>
            </div>
          </div>

          <div class="grid-2">
            <div>
              <div class="section-title">Plot & Land Parcel Information</div>
              <div class="row"><span class="row-label">Plot Identification:</span><span class="row-val">${task.plotId || '—'}</span></div>
              <div class="row"><span class="row-label">Khasra / Dag No:</span><span class="row-val">${task.khasraNo || 'Unverified'}</span></div>
              <div class="row"><span class="row-label">Verified Land Class:</span><span class="row-val">${task.verifiedLandClass || task.landCategory || 'Residential'}</span></div>
              <div class="row"><span class="row-label">Zone Designation:</span><span class="row-val">${(task.zoneType === 'RURAL' || task.isRural) ? 'Rural Area (2.0× Multiplier)' : 'Urban Area (1.2× Multiplier)'}</span></div>
              <div class="row"><span class="row-label">Measured Plot Area:</span><span class="row-val">${areaDisp}</span></div>
              <div class="row"><span class="row-label">Address / Location:</span><span class="row-val" style="max-width: 200px; text-align: right;">${task.address || 'Corridor Alignment'}</span></div>
            </div>

            <div>
              <div class="section-title">Surveyor Verified Citizen & Beneficiary</div>
              <div class="row"><span class="row-label">Beneficiary / Owner:</span><span class="row-val">${task.surveyorOwnerName || task.ownerName || 'Record Pending Verification'}</span></div>
              <div class="row"><span class="row-label">Mobile Contact:</span><span class="row-val">${task.surveyorPhone || task.surveyorOwnerContact || '—'}</span></div>
              <div class="row"><span class="row-label">Aadhaar Reference:</span><span class="row-val" style="color: #2563EB;">${task.surveyorAadhaar || '—'}</span></div>
              <div class="row"><span class="row-label">Soil & Legal Report:</span><span class="row-val">${task.soilReportName || (task.soilReportUrl ? 'Verified & On File' : 'Not Uploaded')}</span></div>
              <div class="row"><span class="row-label">Site Inspection Photo:</span><span class="row-val">${task.sitePhotoName || (task.sitePhotoUrl ? 'Captured On-Site' : 'Not Uploaded')}</span></div>
              <div class="row"><span class="row-label">Dispatched Officer:</span><span class="row-val">${task.dispatchedBy || 'Municipal Authority'}</span></div>
            </div>
          </div>

          <div class="section-title">RFCTLARR 2013 Statutory Financial Breakdown</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 15px; font-size: 12px;">
            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="color: #64748b; font-size: 11px;">Base Circle Rate</div>
              <div style="font-weight: 700; font-size: 14px; margin-top: 2px;">${baseRate}</div>
            </div>
            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="color: #64748b; font-size: 11px;">Assessed Market Value</div>
              <div style="font-weight: 700; font-size: 14px; margin-top: 2px;">${marketVal}</div>
            </div>
            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="color: #64748b; font-size: 11px;">Solatium (100%)</div>
              <div style="font-weight: 700; font-size: 14px; margin-top: 2px; color: #2563EB;">${solatium}</div>
            </div>
            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="color: #64748b; font-size: 11px;">Assets / Trees / Crops</div>
              <div style="font-weight: 700; font-size: 14px; margin-top: 2px; color: #B45309;">${assetVal}</div>
            </div>
          </div>

          <div class="award-box">
            <div>
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: ${isApproved ? '#991B1B' : '#15803D'};">
                ${isApproved ? 'SANCTIONED COMPENSATION AWARD (APPROVED)' : 'ESTIMATED TOTAL RFCTLARR AWARD'}
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                Subject to treasury disbursement to verified Aadhaar-linked beneficiary account.
              </div>
            </div>
            <div class="award-amount">${totalAward}</div>
          </div>

          <div class="remarks-box">
            <strong style="color: #0f172a;">Official Officer Award Remarks:</strong>
            <p style="margin: 6px 0 0 0; color: #334155;">
              ${task.officerRemarks || task.reviewRemarks || 'Plot verified on-ground by surveyor team and reviewed according to West Bengal Land Acquisition Rules under RFCTLARR 2013.'}
            </p>
          </div>

          <div class="footer-sign">
            <div class="sign-line">
              <strong>Surveyor In-Charge</strong><br/>
              Field Verification & GPS Geofence
            </div>
            <div class="sign-line" style="${isApproved ? 'border-top: 2px solid #DC2626;' : ''}">
              <strong style="${isApproved ? 'color: #DC2626;' : ''}">Competent Municipal Officer</strong><br/>
              ${isApproved ? 'APPROVED & SANCTIONED' : 'Under Assessment'}
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          }
        </script>
      </body>
    </html>
  `;

  printableArea.document.write(html);
  printableArea.document.close();
}

export function exportPDF(project = {}, tasks = []) {
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

  const approvedCount = tasks.filter(t => t.officerStatus === 'Approved' || t.status === 'Approved').length;
  const reviewCount = tasks.filter(t => t.officerStatus === 'Under Review' || t.status === 'Under Review').length;
  const rejectedCount = tasks.filter(t => t.officerStatus === 'Rejected' || t.status === 'Rejected').length;
  const pendingCount = tasks.filter(t => !t.officerStatus && t.status !== 'Approved' && t.status !== 'Under Review' && t.status !== 'Rejected').length;

  const rowsHtml = tasks.map((task, idx) => {
    const isApproved = task.officerStatus === 'Approved' || task.status === 'Approved';
    const status = isApproved ? 'Approved' : (task.officerStatus || task.status || 'Pending');

    let statusBg = '#FEF3C7';
    let statusColor = '#92400E';
    let borderAccent = '';

    if (isApproved) {
      statusBg = '#DC2626';
      statusColor = '#FFFFFF';
      // Approved plots highlighted with prominent red border
      borderAccent = 'border-left: 6px solid #DC2626; border-top: 1px solid #FCA5A5; border-bottom: 1px solid #FCA5A5; background-color: #FEF2F2 !important;';
    } else if (status === 'Under Review') {
      statusBg = '#E0F2FE';
      statusColor = '#075985';
    } else if (status === 'Rejected') {
      statusBg = '#FEE2E2';
      statusColor = '#991B1B';
    }

    const areaDisp = task.areaSqm ? `${Number(task.areaSqm).toLocaleString('en-IN')} sq m` : (task.areaSqKm ? `${task.areaSqKm} sq km` : '—');
    
    // Financials
    const fin = task.larr_financials || {};
    const baseRate = (task.baseCircleRateOverride || fin.baseCircleRate) ? `₹${Number(task.baseCircleRateOverride || fin.baseCircleRate).toLocaleString('en-IN')}/sq m` : '—';
    const totalAward = fin.totalAward ? `₹${Number(fin.totalAward).toLocaleString('en-IN')}` : '—';
    const assetVal = (task.assetValue || fin.assetValue) ? `₹${Number(task.assetValue || fin.assetValue).toLocaleString('en-IN')}` : '₹0';

    const isRural = task.zoneType === 'RURAL' || task.isRural || false;
    const zoneLabel = isRural ? 'Rural' : 'Urban';
    const multVal = task.larr_financials?.multiplier ?? (isRural ? 2.0 : 1.2);
    const multiplierLabel = `${multVal}×`;

    return `
      <tr style="border-bottom: 1px solid #E5E7EB; ${borderAccent} background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
        <td style="padding: 10px; font-weight: bold;">
          ${isApproved ? '<span style="color: #DC2626; font-size: 10px; display: block; font-weight: 800;">● APPROVED PLOT</span>' : ''}
          ${task.plotId || '—'}<br/>
          <span style="font-size: 10px; font-weight: normal; color: #6B7280;">${task.khasraNo ? `Khasra: ${task.khasraNo}` : 'Khasra: Unverified'}</span>
        </td>
        <td style="padding: 10px; font-weight: 600;">${task.surveyorOwnerName || task.ownerName || '—'}</td>
        <td style="padding: 10px; font-family: monospace;">${task.surveyorPhone || task.surveyorOwnerContact || '—'}</td>
        <td style="padding: 10px; font-family: monospace; color: #2563EB;">${task.surveyorAadhaar || '—'}</td>
        <td style="padding: 10px;">${task.verifiedLandClass || task.landCategory || '—'}</td>
        <td style="padding: 10px; font-weight: 600;">${zoneLabel}</td>
        <td style="padding: 10px; font-weight: bold; color: #2563EB;">${multiplierLabel}</td>
        <td style="padding: 10px; font-family: monospace;">${areaDisp}</td>
        <td style="padding: 10px; font-family: monospace; color: #B45309;">${assetVal}</td>
        <td style="padding: 10px; font-family: monospace;">${baseRate}</td>
        <td style="padding: 10px; font-weight: bold; font-family: monospace; color: ${isApproved ? '#DC2626' : '#047857'}; font-size: 13px;">${totalAward}</td>
        <td style="padding: 10px;">
          <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 10px; font-weight: 800; background-color: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}40;">
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
        <title>Survey & LARR Valuation Master Report - ${projTitle}</title>
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
            <div class="subtitle">Bhoomi GIS Land Acquisition & RFCTLARR 2013 Master Report</div>
            <div style="font-size: 12px; color: #2563eb; font-weight: 700; margin-top: 4px;">Project: ${projTitle}</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #4B5563;">
            <div>Generated: <strong>${dateStr}</strong></div>
            <div>Total Plots: <strong>${tasks.length}</strong></div>
          </div>
        </div>

        <div class="stats-bar">
          <div class="stat-item" style="border: 2px solid #DC2626; border-radius: 6px; background: #FEF2F2;">
            <div class="stat-value" style="color: #DC2626;">${approvedCount}</div>
            <div class="stat-label" style="color: #DC2626; font-weight: 700;">Approved (Red Highlight)</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color: #0284C7;">${reviewCount}</div>
            <div class="stat-label">Under Review</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" style="color: #991B1B;">${rejectedCount}</div>
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
              <th>Zone</th>
              <th>Multiplier</th>
              <th>Measured Area</th>
              <th>Asset Value</th>
              <th>Circle Rate</th>
              <th>Sanctioned Award</th>
              <th>Officer Decision</th>
              <th>Official Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>Bhoomi GIS Portal — Official Statutory Verification (RFCTLARR Act 2013)</div>
          <div>All Approved plots highlighted with red borders and official sanctioned awards.</div>
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
