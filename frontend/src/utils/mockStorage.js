/**
 * Mock Storage Helper utilities for localStorage operations
 */

export const MOCK_STORAGE_KEYS = {
  TASKS: 'bhoomi_survey_tasks',
  PROJECTS: 'bhoomi_projects',
  SUBMISSIONS: 'bhoomi_surveyor_submissions'
};

export function loadRaw(key, fallback = []) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    console.error(`Error reading ${key} from localStorage:`, e);
    return fallback;
  }
}

export function saveRaw(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key} to localStorage:`, e);
  }
}

export function loadTasks() {
  return loadRaw(MOCK_STORAGE_KEYS.TASKS, []);
}

export function saveTasks(tasks) {
  saveRaw(MOCK_STORAGE_KEYS.TASKS, tasks);
}

export function loadProjects() {
  return loadRaw(MOCK_STORAGE_KEYS.PROJECTS, []);
}

export function saveProjects(projects) {
  saveRaw(MOCK_STORAGE_KEYS.PROJECTS, projects);
}
