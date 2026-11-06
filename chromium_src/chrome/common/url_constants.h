/* Copyright (c) 2019 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef BRAVE_CHROMIUM_SRC_CHROME_COMMON_URL_CONSTANTS_H_
#define BRAVE_CHROMIUM_SRC_CHROME_COMMON_URL_CONSTANTS_H_

#include <stddef.h>

#include "build/branding_buildflags.h"
#include "build/build_config.h"
#include "chrome/common/webui_url_constants.h"
#include "content/public/common/buildflags.h"
#include "net/net_buildflags.h"

namespace chrome {

// "Learn more" URL linked in the dialog to cast using a code.
inline constexpr char kAccessCodeCastLearnMoreURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL for accessibility image labels, linked from the permissions
// dialog shown when a user enables the feature.
inline constexpr char kAccessibilityLabelsLearnMoreURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL for Ad Privacy.
inline constexpr char kAdPrivacyLearnMoreURL[] = "chrome://ecom-help/#privacy";

// "Learn more" URL for when profile settings are automatically reset.
inline constexpr char kAutomaticSettingsResetLearnMoreURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL for Advanced Protection download warnings.
inline constexpr char kAdvancedProtectionDownloadLearnMoreURL[] =
    "chrome://ecom-help/#support";

// "Chrome Settings" URL for the appearance page.
inline constexpr char kBrowserSettingsSearchEngineURL[] =
    "chrome://settings/search";

// "Learn more" URL for Battery Saver Mode.
inline constexpr char16_t kBatterySaverModeLearnMoreUrl[] =
    u"chrome://ecom-help/#support";

// The URL for providing help when the Bluetooth adapter is off.
inline constexpr char kBluetoothAdapterOffHelpURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL shown in the dialog to enable cloud services for Cast.
inline constexpr char kCastCloudServicesHelpURL[] =
    "chrome://ecom-help/#support";

// The URL for the help center article to show when no Cast destination has been
// found.
inline constexpr char kCastNoDestinationFoundURL[] =
    "chrome://ecom-help/#support";

// The URL for the WebHID API help center article.
inline constexpr char kChooserHidOverviewUrl[] =
    "chrome://ecom-help/#privacy";

// The URL for the Web Serial API help center article.
inline constexpr char kChooserSerialOverviewUrl[] =
    "chrome://ecom-help/#privacy";

// The URL for the WebUsb help center article.
inline constexpr char kChooserUsbOverviewURL[] =
    "chrome://ecom-help/#privacy";

// Link to the forum for Chrome Beta.
inline constexpr char kChromeBetaForumURL[] =
    "chrome://ecom-help/#support";

// The URL for the help center article to fix Chrome update problems.
inline constexpr char16_t kChromeFixUpdateProblems[] =
    u"chrome://ecom-help/#updates";

// General help links for Chrome, opened using various actions.
inline constexpr char kChromeHelpViaKeyboardURL[] =
    "chrome://ecom-help/#support";

inline constexpr char kChromeHelpViaMenuURL[] = "chrome://ecom-help/#support";

inline constexpr char kChromeHelpViaWebUIURL[] = "chrome://ecom-help/#support";

inline constexpr char kRelatedWebsiteSetsLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The isolated-app: scheme is used for Isolated Web Apps. A public explainer
// can be found here: https://github.com/reillyeon/isolated-web-apps
inline constexpr char kIsolatedAppScheme[] = "isolated-app";
inline constexpr char16_t kIsolatedAppSchemeUtf16[] = u"isolated-app";

// The chrome-native: scheme is used show pages rendered with platform specific
// widgets instead of using HTML.
inline constexpr char kChromeNativeScheme[] = "chrome-native";

// The chrome-experimental-site-token-provider: scheme is used to retrieve
// site-specific tokens.
inline constexpr char kChromeExperimentalSiteTokenProviderScheme[] =
    "chrome-experimental-site-token-provider";
inline constexpr char kChromeExperimentalSiteTokenHost[] = "token";

// The URL of safe section in Chrome page.
inline constexpr char16_t kChromeSafePageURL[] = u"chrome://ecom-help/#privacy";

// Pages under chrome-search.
inline constexpr char kChromeSearchLocalNtpHost[] = "local-ntp";

// Host and URL for most visited iframes used on the Instant Extended NTP.
inline constexpr char kChromeSearchMostVisitedHost[] = "most-visited";
inline constexpr char kChromeSearchMostVisitedUrl[] =
    "chrome-search://most-visited/";

// URL for NTP custom background image selected from the user's machine and
// filename for the version of the file in the Profile directory
inline constexpr char kChromeUIUntrustedNewTabPageBackgroundUrl[] =
    "chrome-untrusted://new-tab-page/background.jpg";
inline constexpr char kChromeUIUntrustedNewTabPageBackgroundFilename[] =
    "background.jpg";

// Page under chrome-search.
inline constexpr char kChromeSearchRemoteNtpHost[] = "remote-ntp";

// The chrome-search: scheme is served by the same backend as chrome:.  However,
// only specific URLDataSources are enabled to serve requests via the
// chrome-search: scheme.  See |InstantIOContext::ShouldServiceRequest| and its
// callers for details.  Note that WebUIBindings should never be granted to
// chrome-search: pages.  chrome-search: pages are displayable but not readable
// by external search providers (that are rendered by Instant renderer
// processes), and neither displayable nor readable by normal (non-Instant) web
// pages.  To summarize, a non-Instant process, when trying to access
// 'chrome-search://something', will bump up against the following:
//
//  1. Renderer: The display-isolated check in WebKit will deny the request,
//  2. Browser: Assuming they got by #1, the scheme checks in
//     URLDataSource::ShouldServiceRequest will deny the request,
//  3. Browser: for specific sub-classes of URLDataSource, like ThemeSource
//     there are additional Instant-PID checks that make sure the request is
//     coming from a blessed Instant process, and deny the request.
inline constexpr char kChromeSearchScheme[] = "chrome-search";

// This is the base URL of content that can be embedded in chrome://new-tab-page
// using an <iframe>. The embedded untrusted content can make web requests and
// can include content that is from an external source.
inline constexpr char kChromeUIUntrustedNewTabPageUrl[] =
    "chrome-untrusted://new-tab-page/";

// The URL for the Chromium project used in the About dialog.
inline constexpr char16_t kChromiumProjectURL[] =
    u"https://www.chromium.org/";

inline constexpr char16_t kContentSettingsExceptionsLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for cookies.
inline constexpr char kCookiesSettingsHelpCenterURL[] =
    "chrome://ecom-help/#privacy";

// "Learn more" URL for "Aw snap" page when showing "Reload" button.
inline constexpr char kCrashReasonURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL for "Aw snap" page when showing "Send feedback" button.
inline constexpr char kCrashReasonFeedbackDisplayedURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL for the inactive tabs appearance setting.
inline constexpr char16_t kDiscardRingTreatmentLearnMoreUrl[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for the "Do not track" setting in the privacy section.
inline constexpr char16_t kDoNotTrackLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for Universal Opt-Out.
inline constexpr char16_t kUniversalOptOutLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// The URL for the "Learn more" page for interrupted downloads.
inline constexpr char kDownloadInterruptedLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for download scanning.
inline constexpr char kDownloadScanningLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for blocked downloads.
// Note: This is the same as the above URL. This is done to decouple the URLs,
// in case the support page is split apart into separate pages in the future.
inline constexpr char kDownloadBlockedLearnMoreURL[] =
    "chrome://ecom-help/#privacy";

// "Learn more" URL for the Settings API, NTP bubble and other settings bubbles
// showing which extension is controlling them.
inline constexpr char kExtensionControlledSettingLearnMoreURL[] =
    "chrome://ecom-help/#support";

// URL used to indicate that an extension resource load request was invalid.
inline constexpr char kExtensionInvalidRequestURL[] =
    "chrome-extension://invalid/";

// Link for creating family group with Google Families.
inline constexpr char16_t kFamilyGroupCreateURL[] =
    u"chrome://ecom-help/#support";

// Link for viewing family group with Google Families.
inline constexpr char16_t kFamilyGroupViewURL[] = u"chrome://ecom-help/#support";

// "Learn more" URL for Incognito tracking protections.
inline constexpr char kIncognitoTrackingProtectionsLearnMoreUrl[] =
    "chrome://ecom-help/#privacy";

// Url to a blogpost about Flash deprecation.
inline constexpr char kFlashDeprecationLearnMoreURL[] =
    "https://blog.chromium.org/2017/07/so-long-and-thanks-for-all-flash.html";

// URL of the 'Activity controls' section of the privacy settings page.
inline constexpr char kGoogleAccountActivityControlsURL[] =
    "chrome://ecom-help/#support";

// URL of the 'Activity controls' section of the privacy settings page, with
// privacy guide parameters and a link for users to manage data.
inline constexpr char kGoogleAccountActivityControlsURLInPrivacyGuide[] =
    "chrome://ecom-help/#privacy";

// URL of the 'Linked services' section of the privacy settings page.
inline constexpr char kGoogleAccountLinkedServicesURL[] =
    "chrome://ecom-help/#support";

// URL of the Google Account.
inline constexpr char kGoogleAccountURL[] = "chrome://ecom-help/#support";

// URL of the Google Account chooser.
inline constexpr char kGoogleAccountChooserURL[] = "chrome://ecom-help/#support";

// URL of the Google Account page showing the known user devices.
inline constexpr char kGoogleAccountDeviceActivityURL[] =
    "chrome://ecom-help/#support";

// URL of the Google Account home address page.
inline constexpr char kGoogleAccountHomeAddressURL[] =
    "chrome://ecom-help/#support";

// URL of the Google Account work address page.
inline constexpr char kGoogleAccountWorkAddressURL[] =
    "chrome://ecom-help/#support";

// URL of the change Google Account name page.
inline constexpr char kGoogleAccountNameEmailAddressEditURL[] =
    "chrome://ecom-help/#support";

// URL of the two factor authentication setup required intersitial.
inline constexpr char kGoogleTwoFactorIntersitialURL[] =
    "chrome://ecom-help/#support";

// The scheme used for google-chrome:// URLs.
// TODO(b/446672134): Use a distinct value for each brand (e.g.,
//  Google Chrome vs. Chromium) and install mode (e.g., stable vs.
//  side-by-side beta).
inline constexpr char kGoogleChromeURLScheme[] = "google-chrome";

// URL of the Google Password Manager.
inline constexpr char kGooglePasswordManagerURL[] = "chrome://ecom-help/#support";

// The URL for the "Learn more" link for the High Efficiency Mode.
inline constexpr char16_t kMemorySaverModeLearnMoreUrl[] =
    u"chrome://ecom-help/#support";

// The URL in the help text for the High Efficiency Mode tab discarding
// exceptions add dialog.
inline constexpr char16_t kMemorySaverModeTabDiscardingHelpUrl[] =
    u"chrome://ecom-help/#support";

// The URL to the help center article of Incognito mode.
inline constexpr char16_t kIncognitoHelpCenterURL[] =
    u"chrome://ecom-help/#support";

// TODO(crbug.com/498632327): Replace this URL with P-link.
// "Learn more" URL for the web app installation flow, linked from installation
// dialog and options view.
inline constexpr char kInstallDialogFlowLearnMoreURL[] =
    "https://support.google.com/chrome/answer/9658361";

// The URL for the Help Center page about IP Protection.
inline constexpr char kIpProtectionHelpCenterURL[] =
    "https://support.google.com/chrome?p=ip_protection";

// The URL for the "Learn more" page for the usage/crash reporting option in the
// first run dialog.
inline constexpr char kLearnMoreReportingURL[] =
    "chrome://ecom-help/#support";

// The URL for the Help Center page about managing third-party cookies.
inline constexpr char kManage3pcHelpCenterURL[] = "chrome://ecom-help/#support";

// The URL for the tab group sync help center page.
inline constexpr char kTabGroupsLearnMoreURL[] = "chrome://ecom-help/#support";

// The URL for the Learn More page about policies and enterprise enrollment.
inline constexpr char16_t kManagedUiLearnMoreUrl[] =
    u"chrome://ecom-help/#support";

// The URL for the "Learn more" page for insecure download blocking.
inline constexpr char kInsecureDownloadBlockingLearnMoreUrl[] =
    "chrome://ecom-help/#privacy";

// "myactivity.google.com" URLs with their respective UTM sources.
// - In the Clear Browsing Data footer.
// - In the Clear Browsing Data "notice about other forms of history".
// - On the history page.
inline constexpr char16_t kMyActivityUrlInClearBrowsingData[] =
    u"chrome://ecom-help/#support";
inline constexpr char16_t kMyActivityUrlInClearBrowsingDataNotice[] =
    u"chrome://ecom-help/#support";
inline constexpr char16_t kMyActivityUrlInHistory[] =
    u"chrome://ecom-help/#support";

// The URL for the Gemini Personal Context page.
inline constexpr char16_t kGeminiPersonalContextUrl[] =
    u"chrome://ecom-help/#support";

// The URL for "Your Gemini Apps Activity" page.inline constexpr char16_t
// kMyActivityGeminiAppsUrl[] =
inline constexpr char16_t kMyActivityGeminiAppsUrl[] =
    u"chrome://ecom-help/#support";

// The URL for Glic activity button.
inline constexpr char kGlicActivityUrl[] = "chrome://ecom-help/#support";

// The URL for the AI Mode activity page.
inline constexpr char16_t kMyActivityAiModeUrl[] =
    u"chrome://ecom-help/#support";

inline constexpr char16_t kMyActivitySearchServicesAppsUrl[] =
    u"chrome://ecom-help/#support";

// Help URL for the Omnibox setting.
inline constexpr char16_t kOmniboxLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// "What do these mean?" URL for the Page Info bubble.
inline constexpr char kPageInfoHelpCenterURL[] =
    "chrome://ecom-help/#support";

// Help center article URL for automated password change.
inline constexpr char16_t kPasswordChangeLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// Help URL for the bulk password check.
inline constexpr char kPasswordCheckLearnMoreURL[] =
    "chrome://ecom-help/#support";

// Help URL for password generation.
inline constexpr char kPasswordGenerationLearnMoreURL[] =
    "chrome://ecom-help/#support";

inline constexpr char16_t kPasswordManagerLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// Help URL for passwords import.
inline constexpr char kPasswordManagerImportLearnMoreURL[] =
    "chrome://ecom-help/#support";

// Help URL for password sharing.
inline constexpr char kPasswordSharingLearnMoreURL[] =
    "chrome://ecom-help/#support";

// Help URL for troubleshooting password sharing.
inline constexpr char kPasswordSharingTroubleshootURL[] =
    "chrome://ecom-help/#support";

// Help URL for the Payment methods page of the Google Pay site.
inline constexpr char16_t kPaymentMethodsURL[] = u"chrome://ecom-help/#support";

// Help URL for the newer GPay Web site instead of the legacy Payments Center.
inline constexpr char16_t kPaymentMethodsURLForGPayWeb[] =
    u"chrome://ecom-help/#support";

// The URL for the "Fill out forms automatically" support page.
inline constexpr char kAddressesAndPaymentMethodsLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Pay over time" support page.
inline constexpr char16_t kPayOverTimeLearnMoreUrl[] =
    u"chrome://ecom-help/#support";

// The URL for the Wallet website.
inline constexpr char16_t kWalletUrl[] = u"chrome://ecom-help/#support";

// Help URL for Autofill Prediction Improvements.
inline constexpr char16_t kAutofillAiLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for the autofill show card benefits setting.
inline constexpr char16_t kCardBenefitsLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for the Gmail OTP filling setting.
inline constexpr char16_t kGmailOtpFillingLearnMoreURL[] =
    u"chrome://ecom-help/#support";

// URL for Gmail general settings.
inline constexpr char16_t kGmailSettingsURL[] = u"chrome://ecom-help/#support";

// URL for Gmail smart features settings.
inline constexpr char16_t kGmailSmartFeaturesURL[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for the performance intervention notification setting.
inline constexpr char16_t kPerformanceInterventionLearnMoreUrl[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for the preloading section in Performance settings.
inline constexpr char16_t kPreloadingLearnMoreUrl[] =
    u"chrome://ecom-help/#support";

// "Learn more" URL for the Privacy section under Options.
inline constexpr char kPrivacyLearnMoreURL[] =
    "chrome://ecom-help/#privacy";

// The URL for the Learn More link of the non-CWS bubble.
inline constexpr char kRemoveNonCWSExtensionURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL for resetting profile preferences.
inline constexpr char kResetProfileSettingsLearnMoreURL[] =
    "chrome://ecom-help/#support";

// "Learn more" URL for Safebrowsing
inline constexpr char kSafeBrowsingHelpCenterURL[] =
    "chrome://ecom-help/#privacy";

// "Learn more" URL for unsafe site warnings.
inline constexpr char kUnsafeSiteWarningHelpCenterURL[] =
    "chrome://ecom-help/#privacy";

// Updated "Info icon" URL for Safebrowsing
inline constexpr char kSafeBrowsingHelpCenterUpdatedURL[] =
    "chrome://ecom-help/#updates";

// "Learn more" URL for Enhanced Protection
inline constexpr char16_t kSafeBrowsingInChromeHelpCenterURL[] =
    u"chrome://ecom-help/#privacy";

// The URL of Safe Browsing p-tour.
inline constexpr char16_t kSafeBrowsingUseInChromeURL[] =
    u"chrome://ecom-help/#privacy";

// "Learn more" URL for Safety Check page.
inline constexpr char16_t kSafetyHubHelpCenterURL[] =
    u"chrome://ecom-help/#privacy";

// "Learn more" URL for safety tip bubble.
inline constexpr char kSafetyTipHelpCenterURL[] =
    "chrome://ecom-help/#privacy";

// Google search history URL that leads users of the CBD dialog to their search
// history in their Google account.
inline constexpr char16_t kSearchHistoryUrlInClearBrowsingData[] =
    u"chrome://ecom-help/#support";

// The URL for the "See more security tips" with advices how to create a strong
// password.
inline constexpr char kSeeMoreSecurityTipsURL[] = "chrome://ecom-help/#privacy";

// Help URL for the settings page's search feature.
inline constexpr char16_t kSettingsSearchHelpURL[] =
    u"chrome://ecom-help/#support";

// The URL for the Learn More page about Sync and Google services.
inline constexpr char kSyncAndGoogleServicesLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page on sync encryption.
inline constexpr char16_t kSyncEncryptionHelpURL[] =
    u"chrome://ecom-help/#support";

// The URL for the "Learn more" link when there is a sync error.
inline constexpr char kSyncErrorsHelpURL[] = "chrome://ecom-help/#support";

// Legacy URL to the sync google dashboard.
inline constexpr char kLegacySyncGoogleDashboardURL[] =
    "chrome://ecom-help/#support";

// New URL to the sync google dashboard.
inline constexpr char kNewSyncGoogleDashboardURL[] =
    "chrome://ecom-help/#support";

inline constexpr char kSyncGoogleDashboardURL[] = "chrome://ecom-help/#support";

// The URL for the "Learn more" page for sync setup on the personal stuff page.
inline constexpr char16_t kSyncLearnMoreURL[] = u"chrome://ecom-help/#support";

// The URL for the "Learn more" page for signing in to chrome with expanded
// section on "Sign in and turn on sync" in the Computer/Desktop tab.
inline constexpr char kSigninOnDesktopLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for adding a new profile to Chrome.
inline constexpr char kAddNewProfileOnDesktopLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for AI settings for managed users.
inline constexpr char16_t kAiSettingsLearnMorePageManagedUrl[] =
    u"chrome://ecom-help/#support";

// The URL for the "Learn more" page for Help me Write.
inline constexpr char kComposeLearnMorePageURL[] = "chrome://ecom-help/#support";

// The URL for the "Learn more" page for Help me Write for managed users.
inline constexpr char kComposeLearnMorePageManagedURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" links for pages related to History search.
// TODO(crbug.com/328300718): Update help article URL.
inline constexpr char kHistorySearchLearnMorePageURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more about shortcuts" page for Glic.
inline constexpr char kGlicKeyboardShortcutLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more about shortcuts" page for Glic for managed users.
inline constexpr char kGlicKeyboardShortcutLearnMoreManagedURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" links for pages related to History search for
// managed users.
inline constexpr char kHistorySearchLearnMorePageManagedURL[] =
    "chrome://ecom-help/#support";

// The URL for the Settings page to enable history search.
inline constexpr char16_t kHistorySearchSettingURL[] =
    u"chrome://settings/historySearch";

// The URL for the Settings page to enable history search when
// AiSettingsPageRefresh flag is enabled.
inline constexpr char16_t kHistorySearchV2SettingURL[] =
    u"chrome://settings/ai/historySearch";

// The URL for the "Learn more" page for Wallpaper Search.
inline constexpr char kWallpaperSearchLearnMorePageURL[] =
    "chrome://ecom-help/#support";

// The URL for the passed in Google Wallet.
inline constexpr char kWalletPassesPageURL[] = "chrome://ecom-help/#support";

// The help center article URL on using Wallet private passes across Google.
inline constexpr char kWalletPrivatePassHelpCenterURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for Wallpaper Search for managed users.
inline constexpr char kWallpaperSearchLearnMorePageManagedURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for Tab Organization.
inline constexpr char kTabOrganizationLearnMorePageURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for Tab Organization for managed users.
inline constexpr char kTabOrganizationLearnMorePageManagedURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" link in the enterprise disclaimer for managed
// profile in the Signin Intercept bubble.
inline constexpr char kSigninInterceptManagedDisclaimerLearnMoreURL[] =
    "chrome://ecom-help/#support";

#if !BUILDFLAG(IS_ANDROID)
// The URL for the trusted vault sync passphrase opt in.
inline constexpr char kSyncTrustedVaultOptInURL[] =
    "chrome://ecom-help/#support";
#endif

// The URL for the "Learn more" link for the trusted vault sync passphrase.
inline constexpr char kSyncTrustedVaultLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the Help Center page about Tracking Protection settings.
inline constexpr char16_t kTrackingProtectionHelpCenterURL[] =
    u"chrome://ecom-help/#privacy";

// The URL for the Help Center page about User Bypass.
inline constexpr char16_t kUserBypassHelpCenterURL[] =
    u"chrome://ecom-help/#support";

inline constexpr char kUpgradeHelpCenterBaseURL[] =
    "chrome://ecom-help/#updates";

// Help center URL for who the account administrator is.
inline constexpr char16_t kWhoIsMyAdministratorHelpURL[] =
    u"chrome://ecom-help/#support";

// The URL for the "Learn more" link about CWS Enhanced Safe Browsing.
inline constexpr char16_t kCwsEnhancedSafeBrowsingLearnMoreURL[] =
    u"chrome://ecom-help/#privacy";

// The URL path to Google's Privacy Policy page.
inline constexpr char kPrivacyPolicyURL[] = "chrome://ecom-help/#privacy";

// The URL path to Google's Privacy Policy page for users in China.
inline constexpr char kPrivacyPolicyURLChina[] = "chrome://ecom-help/#privacy";

// The URL path to Google's Embedded Privacy Policy page.
inline constexpr char kPrivacyPolicyOnlineURLPath[] =
    "chrome://ecom-help/#privacy";

// The URL path to Google's Embedded Privacy Policy page - Dark Mode.
inline constexpr char kPrivacyPolicyOnlineDarkModeURLPath[] =
    "chrome://ecom-help/#privacy";

// The URL path to Google's Embedded Privacy Policy page for users in China.
inline constexpr char kPrivacyPolicyEmbeddedURLPathChina[] =
    "chrome://ecom-help/#privacy";

// The URL path to Google's Embedded Privacy Policy page for users in China -
// Dark Mode.
inline constexpr char kPrivacyPolicyEmbeddedDarkModeURLPathChina[] =
    "chrome://ecom-help/#privacy";

#if BUILDFLAG(IS_ANDROID)
// "Learn more" URL for the enhanced playback notification dialog.
inline constexpr char kEnhancedPlaybackNotificationLearnMoreURL[] =
    // Keep in sync with chrome/android/java/strings/android_chrome_strings.grd
    "https://community.brave.app";
#endif

#if BUILDFLAG(IS_MAC)
// "Learn more" URL for the enterprise sign-in confirmation dialog.
inline constexpr char kChromeEnterpriseSignInLearnMoreURL[] =
    "chrome://ecom-help/#support";

// The URL for the "learn more" link on the macOS version obsolescence infobar.
inline constexpr char kMacOsObsoleteURL[] =
    "chrome://ecom-help/#support";
#endif

#if BUILDFLAG(IS_WIN)
// The URL for the Windows XP/Vista deprecation help center article.
inline constexpr char kWindowsXPVistaDeprecationURL[] =
    "chrome://ecom-help/#support";

// The URL for the Windows 7/8.1 deprecation help center article.
inline constexpr char kWindows78DeprecationURL[] =
    "chrome://ecom-help/#support";

// The URL for the "Learn more" page for process isolation.
inline constexpr char kProcessIsolationLearnMoreUrl[] =
    "chrome://ecom-help/#support";
#endif  // BUILDFLAG(IS_WIN)

// "Learn more" URL for the one click signin infobar.
inline constexpr char kChromeSyncLearnMoreURL[] = "chrome://ecom-help/#support";

#if BUILDFLAG(ENABLE_PLUGINS)
// The URL for the "Learn more" page for the outdated plugin infobar.
inline constexpr char kOutdatedPluginLearnMoreURL[] =
    "chrome://ecom-help/#support";
#endif

#if BUILDFLAG(IS_WIN) || BUILDFLAG(IS_MAC) || BUILDFLAG(IS_LINUX)
// "Learn more" URL for the chrome apps deprecation dialog.
inline constexpr char kChromeAppsDeprecationLearnMoreURL[] =
    "https://support.google.com/chrome/?p=chrome_app_deprecation";
#endif

#if BUILDFLAG(CHROME_ROOT_STORE_SUPPORTED)
// TODO(b/1339340): add help center link when help center link is created.
inline constexpr char kChromeRootStoreSettingsHelpCenterURL[] =
    "https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/"
    "chrome_root_store/root_store.md";
#endif

#if BUILDFLAG(ENABLE_PDF_SAVE_TO_DRIVE)
// TODO(crbug.com/436926181): Make sure the URL is not a dead link.
// "Learn more" URL for how to save PDF to Google Drive from the PDF viewer.
inline constexpr char kPdfViewerSaveToDriveHelpCenterURL[] =
    "chrome://ecom-help/#support";
#endif

#if defined(UNIT_TEST)
// For
// chrome/browser/privacy_sandbox/browsing_topics_settings_interactive_uitest.cc
// only. No UI uses these.
inline constexpr char kPrivacySandboxManageTopicsURL[] = "";
inline constexpr char kPrivacySandboxAdTopicsURL[] = "";
#endif

}  // namespace chrome

#endif  // BRAVE_CHROMIUM_SRC_CHROME_COMMON_URL_CONSTANTS_H_
