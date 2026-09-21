-- ========================================================================
-- BhoomiAcquire GIS — Supabase PostgreSQL Schema Script
-- ========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'UNDER_REVIEW', 'RESUBMITTED', 'CLOSED'
  base_rates JSONB NOT NULL DEFAULT '{"Residential": 4500, "Commercial": 8500, "Agricultural": 2200}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT DEFAULT 'Municipal Officer'
);

-- 3. SURVEY TASKS / PLOTS TABLE
CREATE TABLE IF NOT EXISTS survey_tasks (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  khasra_no TEXT DEFAULT '',
  project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  address TEXT NOT NULL,
  coords JSONB NOT NULL DEFAULT '{"lat": 22.5726, "lng": 88.3639}'::jsonb,
  land_category TEXT DEFAULT 'Residential',
  area_sq_km NUMERIC DEFAULT 0,
  area_sq_m NUMERIC DEFAULT 0,
  owner_name TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending', 'In Progress', 'Completed'
  dispatched_by TEXT DEFAULT 'Municipal Officer',
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Surveyor On-site Verified Details
  surveyor_owner_name TEXT DEFAULT '',
  surveyor_phone TEXT DEFAULT '',
  surveyor_aadhaar TEXT DEFAULT '',
  surveyor_owner_contact TEXT DEFAULT '',
  verified_land_class TEXT DEFAULT 'Residential',
  zone_type TEXT DEFAULT 'URBAN', -- 'URBAN' or 'RURAL'
  is_rural BOOLEAN DEFAULT FALSE,
  area_sqm NUMERIC,
  asset_value NUMERIC,
  soil_report_url TEXT,
  soil_report_name TEXT,
  site_photo_url TEXT,
  site_photo_name TEXT,
  resubmitted_at TIMESTAMPTZ,
  
  -- Municipal Officer Review & LARR Financials
  officer_status TEXT, -- 'Approved', 'Under Review', 'Rejected'
  officer_remarks TEXT DEFAULT '',
  review_remarks TEXT DEFAULT '',
  base_circle_rate_override NUMERIC,
  zone_type_override TEXT,
  larr_financials JSONB
);

-- 4. DISBURSEMENTS TABLE
CREATE TABLE IF NOT EXISTS disbursements (
  task_id TEXT PRIMARY KEY REFERENCES survey_tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'NOT_INITIATED', -- 'NOT_INITIATED', 'INITIATED', 'TREASURY_VERIFYING', 'DISBURSED', 'Stalled'
  award_amount NUMERIC NOT NULL DEFAULT 0,
  beneficiary_name TEXT DEFAULT '',
  bank_reference_id TEXT DEFAULT NULL,
  initiated_at TIMESTAMPTZ DEFAULT NULL,
  disbursed_at TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ROW LEVEL SECURITY & OPEN POLICIES FOR ALL OPERATIONAL ROLES
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all access on projects" ON projects;
CREATE POLICY "Allow public all access on projects" ON projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access on survey_tasks" ON survey_tasks;
CREATE POLICY "Allow public all access on survey_tasks" ON survey_tasks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access on disbursements" ON disbursements;
CREATE POLICY "Allow public all access on disbursements" ON disbursements FOR ALL USING (true) WITH CHECK (true);

-- 6. ENABLE REALTIME REPLICATION FOR LIVE UPDATES
ALTER PUBLICATION supabase_realtime ADD TABLE projects, survey_tasks, disbursements;
