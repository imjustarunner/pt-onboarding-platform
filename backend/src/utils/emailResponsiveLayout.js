// Shared by tenant, portal and message frames; inline spacing remains usable
// when a mail client ignores media queries.
export const EMAIL_RESPONSIVE_STYLES = `<style data-email-responsive="1">
@media only screen and (max-width:600px){
 .email-frame{padding:0 0 16px!important}
 .email-body{padding:20px 16px!important}
 .email-body-owned{padding:0!important}
 .email-content-cell{padding-left:16px!important;padding-right:16px!important}
 .email-card img{max-width:100%!important;height:auto!important}
 .email-card{width:100%!important;border-radius:0!important}
 .email-header-brand,.email-header-agency{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:left!important}
 .email-header-agency{padding:14px 0 0!important}
 .email-header-agency table{float:none!important;margin:0!important}
 .email-body-owned>[data-pt-staff-signature]{margin-left:16px!important;margin-right:16px!important}
 .email-signature-row{display:block!important}
 .email-signature-photo{display:inline-block!important;width:70px!important;vertical-align:top!important}
 .email-signature-details{display:inline-block!important;width:calc(100% - 78px)!important;box-sizing:border-box!important;vertical-align:top!important}
 .email-signature-brand{display:block!important;width:100%!important;box-sizing:border-box!important;border-left:0!important;padding:16px 0 0!important}
 .email-stack{display:block!important;width:100%!important;box-sizing:border-box!important}
}
</style>`;
