import PlatformBranding from '../models/PlatformBranding.model.js';
import { validationResult } from 'express-validator';

export const getPlatformBranding = async (req, res, next) => {
  try {
    console.log('getPlatformBranding: Fetching platform branding...');
    const branding = await PlatformBranding.get();
    console.log('getPlatformBranding: Branding fetched successfully');
    res.json(branding);
  } catch (error) {
    console.error('getPlatformBranding: Error:', error);
    console.error('getPlatformBranding: Error stack:', error.stack);
    // Return default branding if table doesn't exist or query fails
    if (error.code === 'ER_NO_SUCH_TABLE' || error.message.includes('doesn\'t exist')) {
      console.warn('getPlatformBranding: platform_branding table does not exist, returning defaults');
      res.json({
        id: null,
        tagline: 'The gold standard for behavioral health workflows.',
        primary_color: '#C69A2B',
        secondary_color: '#1D2633',
        accent_color: '#3A4C6B',
        success_color: '#2F8F83',
        background_color: '#F3F6FA',
        error_color: '#CC3D3D',
        warning_color: '#E6A700',
        header_font: 'Inter',
        body_font: 'Source Sans 3',
        numeric_font: 'IBM Plex Mono',
        display_font: 'Montserrat'
      });
    } else {
      next(error);
    }
  }
};

export const updatePlatformBranding = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const {
      tagline,
      primaryColor,
      secondaryColor,
      accentColor,
      successColor,
      backgroundColor,
      errorColor,
      warningColor,
      headerFont,
      bodyFont,
      numericFont,
      displayFont,
      headerFontId,
      bodyFontId,
      numericFontId,
      displayFontId,
      peopleOpsTerm,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      masterBrandIconId,
      manageAgenciesIconId,
      manageModulesIconId,
      manageDocumentsIconId,
      manageUsersIconId,
      platformSettingsIconId,
      viewAllProgressIconId,
      progressDashboardIconId,
      settingsIconId,
      allAgenciesNotificationsIconId,
      organizationName,
      organizationLogoIconId
    } = req.body;

    const branding = await PlatformBranding.update({
      tagline,
      primaryColor,
      secondaryColor,
      accentColor,
      successColor,
      backgroundColor,
      errorColor,
      warningColor,
      headerFont,
      bodyFont,
      numericFont,
      displayFont,
      headerFontId: headerFontId !== undefined ? (headerFontId === null || headerFontId === '' ? null : parseInt(headerFontId)) : undefined,
      bodyFontId: bodyFontId !== undefined ? (bodyFontId === null || bodyFontId === '' ? null : parseInt(bodyFontId)) : undefined,
      numericFontId: numericFontId !== undefined ? (numericFontId === null || numericFontId === '' ? null : parseInt(numericFontId)) : undefined,
      displayFontId: displayFontId !== undefined ? (displayFontId === null || displayFontId === '' ? null : parseInt(displayFontId)) : undefined,
      peopleOpsTerm,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      masterBrandIconId,
      manageAgenciesIconId,
      manageModulesIconId,
      manageDocumentsIconId,
      manageUsersIconId,
      platformSettingsIconId,
      viewAllProgressIconId,
      progressDashboardIconId,
      settingsIconId,
      allAgenciesNotificationsIconId,
      organizationName,
      organizationLogoIconId: organizationLogoIconId !== undefined ? (organizationLogoIconId === null || organizationLogoIconId === '' ? null : parseInt(organizationLogoIconId)) : undefined,
      organizationLogoUrl
    }, req.user.id);

    res.json(branding);
  } catch (error) {
    console.error('updatePlatformBranding: Error:', error);
    console.error('updatePlatformBranding: Error stack:', error.stack);
    console.error('updatePlatformBranding: Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      errno: error.errno
    });
    next(error);
  }
};

