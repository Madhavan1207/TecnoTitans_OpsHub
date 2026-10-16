import { createContext, useContext } from 'react';
import { actionMinRole, hasModule, moduleConfig, resolveFields, roleAtLeast } from '@shared/registry.js';

const Ctx = createContext(null);
export const SiteProvider = Ctx.Provider;
export const useSite = () => useContext(Ctx);

export function buildSiteContext({ slug, config, role, roleLabel, preview, api, site }) {
  return {
    slug, config, role, roleLabel, preview, api, site,
    has: (k) => hasModule(config, k),
    mod: (k) => moduleConfig(config, k),
    fields: (k) => resolveFields(config, k),
    can: (k, action) => hasModule(config, k) && roleAtLeast(role, actionMinRole(config, k, action)),
    minRole: (k, action) => actionMinRole(config, k, action),
    base: `/s/${slug}${preview ? '' : ''}`,
    q: preview ? '?preview=1' : '',
  };
}
