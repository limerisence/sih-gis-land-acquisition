/**
 * Unified Data Service for Bhoomi GIS Land Acquisition
 * Supports Supabase PostgreSQL backend with automatic local fallback and Realtime subscriptions
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';

const LS_TASKS_KEY = 'bhoomi_survey_tasks';
const LS_PROJECTS_KEY = 'bhoomi_projects';
const LS_DISBURSE_KEY = 'bhoomi_disbursements';

const loadRaw = (key, fb = []) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fb));
  } catch {
    return fb;
  }
};
const saveRaw = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

// ─── Helpers: Mappings between JS CamelCase and Postgres snake_case ─────────
export function projectToDb(p) {
  return {
    project_id: p.project_id || p.projectId,
    project_name: p.project_name || p.projectName,
    status: p.status || 'PENDING',
    base_rates: p.baseRates || p.base_rates || { Residential: 4500, Commercial: 8500, Agricultural: 2200 },
    created_at: p.created_at || new Date().toISOString(),
    created_by: p.created_by || p.createdBy || 'Municipal Officer',
  };
}

export function projectFromDb(row) {
  return {
    project_id: row.project_id,
    project_name: row.project_name,
    status: row.status,
    baseRates: row.base_rates || { Residential: 4500, Commercial: 8500, Agricultural: 2200 },
    base_rates: row.base_rates,
    created_at: row.created_at,
    created_by: row.created_by,
  };
}

export function taskToDb(t) {
  return {
    id: t.id,
    plot_id: t.plotId || t.plot_id,
    khasra_no: t.khasraNo || t.khasra_no || '',
    project_id: t.projectId || t.project_id,
    project_name: t.projectName || t.project_name,
    address: t.address || '',
    coords: t.coords || { lat: 22.5726, lng: 88.3639 },
    land_category: t.landCategory || t.land_category || 'Residential',
    area_sq_km: t.areaSqKm ?? t.area_sq_km ?? 0,
    area_sq_m: t.areaSqM ?? t.area_sq_m ?? 0,
    owner_name: t.ownerName || t.owner_name || '',
    status: t.status || 'Pending',
    dispatched_by: t.dispatchedBy || t.dispatched_by || 'Municipal Officer',
    dispatched_at: t.dispatchedAt || t.dispatched_at || new Date().toISOString(),
    surveyor_owner_name: t.surveyorOwnerName || t.surveyor_owner_name || '',
    surveyor_phone: t.surveyorPhone || t.surveyor_phone || '',
    surveyor_aadhaar: t.surveyorAadhaar || t.surveyor_aadhaar || '',
    surveyor_owner_contact: t.surveyorOwnerContact || t.surveyor_owner_contact || '',
    verified_land_class: t.verifiedLandClass || t.verified_land_class || t.landCategory || 'Residential',
    zone_type: t.zoneType || t.zone_type || 'URBAN',
    is_rural: Boolean(t.zoneType === 'RURAL' || t.isRural || t.is_rural),
    area_sqm: t.areaSqm !== undefined && t.areaSqm !== '' && t.areaSqm !== null ? Number(t.areaSqm) : (t.area_sqm !== undefined ? t.area_sqm : null),
    asset_value: t.assetValue !== undefined && t.assetValue !== '' && t.assetValue !== null ? Number(t.assetValue) : (t.asset_value !== undefined ? t.asset_value : null),
    soil_report_url: t.soilReportUrl || t.soil_report_url || null,
    soil_report_name: t.soilReportName || t.soil_report_name || null,
    site_photo_url: t.sitePhotoUrl || t.site_photo_url || null,
    site_photo_name: t.sitePhotoName || t.site_photo_name || null,
    resubmitted_at: t.resubmittedAt || t.resubmitted_at || null,
    officer_status: t.officerStatus || t.officer_status || null,
    officer_remarks: t.officerRemarks || t.officer_remarks || '',
    review_remarks: t.reviewRemarks || t.review_remarks || '',
    base_circle_rate_override: t.baseCircleRateOverride !== undefined ? t.baseCircleRateOverride : t.base_circle_rate_override,
    zone_type_override: t.zoneTypeOverride || t.zone_type_override || null,
    larr_financials: t.larr_financials || null,
  };
}

export function taskFromDb(row) {
  return {
    id: row.id,
    plotId: row.plot_id,
    plot_id: row.plot_id,
    khasraNo: row.khasra_no || '',
    projectId: row.project_id,
    projectName: row.project_name,
    address: row.address,
    coords: row.coords || { lat: 22.5726, lng: 88.3639 },
    landCategory: row.land_category,
    areaSqKm: row.area_sq_km ? Number(row.area_sq_km) : 0,
    areaSqM: row.area_sq_m ? Number(row.area_sq_m) : 0,
    ownerName: row.owner_name,
    status: row.status,
    dispatchedBy: row.dispatched_by,
    dispatchedAt: row.dispatched_at,
    surveyorOwnerName: row.surveyor_owner_name || '',
    surveyorPhone: row.surveyor_phone || '',
    surveyorAadhaar: row.surveyor_aadhaar || '',
    surveyorOwnerContact: row.surveyor_owner_contact || '',
    verifiedLandClass: row.verified_land_class || row.land_category || 'Residential',
    zoneType: row.zone_type || 'URBAN',
    isRural: Boolean(row.is_rural),
    areaSqm: row.area_sqm,
    assetValue: row.asset_value,
    soilReportUrl: row.soil_report_url,
    soilReportName: row.soil_report_name,
    sitePhotoUrl: row.site_photo_url,
    sitePhotoName: row.site_photo_name,
    resubmittedAt: row.resubmitted_at,
    officerStatus: row.officer_status,
    officerRemarks: row.officer_remarks || '',
    reviewRemarks: row.review_remarks || '',
    baseCircleRateOverride: row.base_circle_rate_override ? Number(row.base_circle_rate_override) : undefined,
    zoneTypeOverride: row.zone_type_override,
    larr_financials: row.larr_financials,
  };
}

// ─── Unified Data Service API ────────────────────────────────────────────────
export const dataService = {
  isCloud: isSupabaseConfigured,

  // PROJECTS
  async getProjects() {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          const mapped = data.map(projectFromDb);
          saveRaw(LS_PROJECTS_KEY, mapped); // sync local cache
          return mapped;
        }
      } catch (e) {
        console.warn('[DataService] Supabase getProjects failed, using local cache:', e);
      }
    }
    return loadRaw(LS_PROJECTS_KEY, []);
  },

  async saveProjects(projectsList) {
    saveRaw(LS_PROJECTS_KEY, projectsList);
    if (isSupabaseConfigured && projectsList.length > 0) {
      try {
        const rows = projectsList.map(projectToDb);
        await supabase.from('projects').upsert(rows, { onConflict: 'project_id' });
      } catch (e) {
        console.warn('[DataService] Supabase saveProjects error:', e);
      }
    }
  },

  async addProject(project) {
    const list = loadRaw(LS_PROJECTS_KEY, []);
    const updated = [project, ...list.filter((p) => (p.project_id || p.projectId) !== (project.project_id || project.projectId))];
    saveRaw(LS_PROJECTS_KEY, updated);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('projects').upsert([projectToDb(project)]);
      } catch (e) {
        console.warn('[DataService] Supabase addProject error:', e);
      }
    }
    return updated;
  },

  async deleteProject(projectId) {
    const list = loadRaw(LS_PROJECTS_KEY, []);
    const updatedProjects = list.filter((p) => (p.project_id || p.projectId) !== projectId);
    saveRaw(LS_PROJECTS_KEY, updatedProjects);

    const tasks = loadRaw(LS_TASKS_KEY, []);
    const updatedTasks = tasks.filter((t) => t.projectId !== projectId);
    saveRaw(LS_TASKS_KEY, updatedTasks);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('survey_tasks').delete().eq('project_id', projectId);
        await supabase.from('projects').delete().eq('project_id', projectId);
      } catch (e) {
        console.warn('[DataService] Supabase deleteProject error:', e);
      }
    }
    return { projects: updatedProjects, tasks: updatedTasks };
  },

  // TASKS
  async getTasks() {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('survey_tasks').select('*').order('dispatched_at', { ascending: false });
        if (!error && data) {
          const mapped = data.map(taskFromDb);
          saveRaw(LS_TASKS_KEY, mapped);
          return mapped;
        }
      } catch (e) {
        console.warn('[DataService] Supabase getTasks failed, using local cache:', e);
      }
    }
    return loadRaw(LS_TASKS_KEY, []);
  },

  async saveTasks(tasksList) {
    saveRaw(LS_TASKS_KEY, tasksList);
    if (isSupabaseConfigured && tasksList.length > 0) {
      try {
        const rows = tasksList.map(taskToDb);
        await supabase.from('survey_tasks').upsert(rows, { onConflict: 'id' });
      } catch (e) {
        console.warn('[DataService] Supabase saveTasks error:', e);
      }
    }
  },

  async updateTask(taskId, updates) {
    const all = loadRaw(LS_TASKS_KEY, []);
    const updated = all.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
    saveRaw(LS_TASKS_KEY, updated);

    if (isSupabaseConfigured) {
      try {
        const target = updated.find((t) => t.id === taskId);
        if (target) {
          await supabase.from('survey_tasks').upsert([taskToDb(target)]);
        }
      } catch (e) {
        console.warn('[DataService] Supabase updateTask error:', e);
      }
    }
    return updated;
  },

  // DISBURSEMENTS
  async getDisbursements() {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.from('disbursements').select('*');
        if (!error && data) {
          const map = {};
          data.forEach((r) => {
            map[r.task_id] = {
              status: r.status || 'NOT_INITIATED',
              awardAmount: Number(r.award_amount || 0),
              beneficiaryName: r.beneficiary_name || '',
              bankReferenceId: r.bank_reference_id || null,
              initiatedAt: r.initiated_at || null,
              disbursedAt: r.disbursed_at || null,
              updatedAt: r.updated_at || null,
            };
          });
          saveRaw(LS_DISBURSE_KEY, map);
          return map;
        }
      } catch (e) {
        console.warn('[DataService] Supabase getDisbursements failed, using local cache:', e);
      }
    }
    return loadRaw(LS_DISBURSE_KEY, {});
  },

  async getDisbursementForTask(taskId) {
    if (!taskId) return null;
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('disbursements')
          .select('*')
          .eq('task_id', taskId)
          .single();
        if (!error && data) {
          const record = {
            status: data.status || 'NOT_INITIATED',
            awardAmount: Number(data.award_amount || 0),
            beneficiaryName: data.beneficiary_name || '',
            bankReferenceId: data.bank_reference_id || null,
            initiatedAt: data.initiated_at || null,
            disbursedAt: data.disbursed_at || null,
            updatedAt: data.updated_at || null,
          };
          const currentMap = loadRaw(LS_DISBURSE_KEY, {});
          currentMap[taskId] = record;
          saveRaw(LS_DISBURSE_KEY, currentMap);
          return record;
        }
      } catch (e) {
        console.warn('[DataService] getDisbursementForTask failed:', e);
      }
    }
    const currentMap = loadRaw(LS_DISBURSE_KEY, {});
    return currentMap[taskId] || null;
  },

  async upsertDisbursement(taskId, updates) {
    if (!taskId) return;
    const currentMap = loadRaw(LS_DISBURSE_KEY, {});
    const prev = currentMap[taskId] || {
      status: 'NOT_INITIATED',
      awardAmount: 0,
      beneficiaryName: '',
      bankReferenceId: null,
      initiatedAt: null,
      disbursedAt: null,
    };
    const merged = { ...prev, ...updates, updatedAt: new Date().toISOString() };
    currentMap[taskId] = merged;
    saveRaw(LS_DISBURSE_KEY, currentMap);

    if (isSupabaseConfigured) {
      try {
        const dbRow = {
          task_id: taskId,
          status: merged.status,
          award_amount: merged.awardAmount,
          beneficiary_name: merged.beneficiaryName || null,
          bank_reference_id: merged.bankReferenceId || null,
          initiated_at: merged.initiatedAt || null,
          disbursed_at: merged.disbursedAt || null,
          updated_at: merged.updatedAt,
        };
        await supabase.from('disbursements').upsert([dbRow], { onConflict: 'task_id' });
      } catch (e) {
        console.warn('[DataService] Supabase upsertDisbursement error:', e);
      }
    }
    return merged;
  },

  async saveDisbursements(disbMap) {
    saveRaw(LS_DISBURSE_KEY, disbMap);
    if (isSupabaseConfigured) {
      try {
        const rows = Object.entries(disbMap).map(([taskId, val]) => ({
          task_id: taskId,
          status: val.status || 'NOT_INITIATED',
          award_amount: val.awardAmount || 0,
          beneficiary_name: val.beneficiaryName || null,
          bank_reference_id: val.bankReferenceId || null,
          initiated_at: val.initiatedAt || null,
          disbursed_at: val.disbursedAt || null,
          updated_at: new Date().toISOString(),
        }));
        if (rows.length > 0) {
          await supabase.from('disbursements').upsert(rows, { onConflict: 'task_id' });
        }
      } catch (e) {
        console.warn('[DataService] Supabase saveDisbursements error:', e);
      }
    }
  },

  // REALTIME SUBSCRIPTION
  subscribe(callback) {
    if (!isSupabaseConfigured || !supabase) return () => {};

    const channel = supabase
      .channel('bhoomi-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => callback('projects', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_tasks' }, (payload) => callback('tasks', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disbursements' }, (payload) => callback('disbursements', payload))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
