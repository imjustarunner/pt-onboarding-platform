-- Rebrand the platform only. Tenant-owned agency palettes and logos are untouched.
UPDATE platform_branding
SET organization_name = 'Plot Twist Co',
    organization_logo_url = '/assets/ptco/logo-flat.webp',
    organization_logo_icon_id = NULL,
    organization_logo_path = NULL,
    primary_color = '#B80016',
    secondary_color = '#1D2633',
    accent_color = '#B80016',
    background_color = '#F6F7F9',
    tagline = 'People, services, and operations. Connected.';
