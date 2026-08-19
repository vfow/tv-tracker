export const SETTINGS_SECTIONS = ["profile", "auth", "notifications", "streaming", "data", "danger-zone"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export interface SettingsOpenOptions { fromRoute?: boolean; skipShowPage?: boolean; }
export interface SettingsController { render(): void; open(section?: string, options?: SettingsOpenOptions): void; current(): SettingsSection; normalizeSection(value?: string): SettingsSection; routeFor(section?: string): string; sectionFromPath(pathname?: string): SettingsSection; readonly sections: ReadonlyArray<{id: SettingsSection; label: string}>; }
const labels: Record<SettingsSection,string> = {profile:"PROFILE",auth:"AUTH",notifications:"NOTIFICATIONS",streaming:"STREAMING",data:"DATA","danger-zone":"DANGER ZONE"};
const sectionSet = new Set<string>(SETTINGS_SECTIONS);
export function normalizeSettingsSection(value?: string): SettingsSection { const clean=String(value||"profile").trim().toLowerCase(); return (sectionSet.has(clean)?clean:"profile") as SettingsSection; }
export function settingsSectionFromPath(pathname?: string): SettingsSection { const match=String(pathname||"").match(/^\/app\/settings(?:\/([^/?#]+))?\/?$/); return normalizeSettingsSection(match?.[1]); }
export function settingsRouteFor(section?: string): string { return `/app/settings/${normalizeSettingsSection(section)}`; }
function markOwner(): void { const root=document.getElementById("settings-content"); if(root) root.dataset.settingsOwner="modern"; }
export function installSettingsDomain(): SettingsController | undefined {
  const legacy=window.TVTrackerSettings;
  if(!legacy || legacy.__modernOwner===true) return legacy as SettingsController | undefined;
  const sections=Object.freeze(SETTINGS_SECTIONS.map(id=>Object.freeze({id,label:labels[id]})));
  const controller: SettingsController & {readonly __modernOwner:true}=Object.freeze({
    __modernOwner:true, sections,
    render(){ markOwner(); legacy.render(); markOwner(); },
    open(section="profile",options={}){ const normalized=normalizeSettingsSection(section); markOwner(); legacy.open(normalized,options); markOwner(); },
    current(){ return normalizeSettingsSection(legacy.current()); },
    normalizeSection:normalizeSettingsSection, routeFor:settingsRouteFor, sectionFromPath:settingsSectionFromPath
  });
  window.TVTrackerSettings=controller; markOwner(); return controller;
}
