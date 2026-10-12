/**
 * Supported Languages for PolyGlot PDF Translator
 * Full coverage of major global languages with native names and country flags.
 */

const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Detect Language', native: 'Auto Detect', flag: '🌐' },
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文', flag: '🇨🇳' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文', flag: '🇹🇼' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷' },
  { code: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', flag: '🇧🇩' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', native: 'Polski', flag: '🇵🇱' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', flag: '🇺🇦' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'th', name: 'Thai', native: 'ไทย', flag: '🇹🇭' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'he', name: 'Hebrew', native: 'עברית', flag: '🇮🇱' },
  { code: 'sv', name: 'Swedish', native: 'Svenska', flag: '🇸🇪' },
  { code: 'no', name: 'Norwegian', native: 'Norsk', flag: '🇳🇴' },
  { code: 'da', name: 'Danish', native: 'Dansk', flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish', native: 'Suomi', flag: '🇫🇮' },
  { code: 'cs', name: 'Czech', native: 'Čeština', flag: '🇨🇿' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar', flag: '🇭🇺' },
  { code: 'ro', name: 'Romanian', native: 'Română', flag: '🇷🇴' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'fa', name: 'Persian', native: 'فارسی', flag: '🇮🇷' },
  { code: 'ur', name: 'Urdu', native: 'اردو', flag: '🇵🇰' },
  { code: 'tl', name: 'Tagalog (Filipino)', native: 'Tagalog', flag: '🇵🇭' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'si', name: 'Sinhala', native: 'සිංහල', flag: '🇱🇰' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili', flag: '🇰🇪' },
  { code: 'sk', name: 'Slovak', native: 'Slovenčina', flag: '🇸🇰' },
  { code: 'bg', name: 'Bulgarian', native: 'Български', flag: '🇧🇬' },
  { code: 'hr', name: 'Croatian', native: 'Hrvatski', flag: '🇭🇷' },
  { code: 'sr', name: 'Serbian', native: 'Српски', flag: '🇷🇸' },
  { code: 'ca', name: 'Catalan', native: 'Català', flag: '🇪🇸' }
];

// Helper to populate select dropdowns
function populateLanguageDropdown(selectEl, selectedValue, includeAuto = true) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  SUPPORTED_LANGUAGES.forEach(lang => {
    if (!includeAuto && lang.code === 'auto') return;
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = `${lang.flag} ${lang.name} (${lang.native})`;
    if (lang.code === selectedValue) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });
}

// Get language details by code
function getLanguageByCode(code) {
  return SUPPORTED_LANGUAGES.find(l => l.code === code) || {
    code,
    name: code,
    native: code,
    flag: '🌐'
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SUPPORTED_LANGUAGES, populateLanguageDropdown, getLanguageByCode };
}
