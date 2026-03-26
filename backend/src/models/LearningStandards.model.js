import pool from '../config/database.js';

class LearningStandards {
  static async getCatalog() {
    const [domains] = await pool.execute(
      `SELECT id, code, title, description, source_framework, version
       FROM learning_standards_domains
       WHERE is_active = 1
       ORDER BY title ASC`
    );

    const domainIds = domains.map((d) => d.id);
    if (!domainIds.length) {
      return [];
    }

    const placeholders = domainIds.map(() => '?').join(',');

    const [subdomains] = await pool.execute(
      `SELECT id, domain_id, code, title, description, source_framework, version
       FROM learning_standards_subdomains
       WHERE is_active = 1 AND domain_id IN (${placeholders})
       ORDER BY title ASC`,
      domainIds
    );

    const [standards] = await pool.execute(
      `SELECT id, domain_id, subdomain_id, code, title, description, grade_band, source_framework, version
       FROM learning_standards
       WHERE is_active = 1 AND domain_id IN (${placeholders})
       ORDER BY code ASC`,
      domainIds
    );

    const [skills] = await pool.execute(
      `SELECT id, domain_id, subdomain_id, standard_id, code, title, description, grade_level, skill_order
       FROM learning_skills
       WHERE is_active = 1 AND domain_id IN (${placeholders})
       ORDER BY skill_order ASC, title ASC`,
      domainIds
    );

    return domains.map((domain) => ({
      ...domain,
      subdomains: subdomains
        .filter((s) => s.domain_id === domain.id)
        .map((subdomain) => ({
          ...subdomain,
          standards: standards.filter((st) => st.subdomain_id === subdomain.id),
          skills: skills.filter((sk) => sk.subdomain_id === subdomain.id)
        })),
      standards: standards.filter((st) => st.domain_id === domain.id && !st.subdomain_id),
      skills: skills.filter((sk) => sk.domain_id === domain.id && !sk.subdomain_id)
    }));
  }
}

export default LearningStandards;
