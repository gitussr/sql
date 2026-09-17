import { webDarkTheme, webLightTheme, type Theme } from '@fluentui/react-components';

/**
 * Fluent 2 web themes (Microsoft brand ramp). The only override is the
 * monospace stack: Cascadia is Microsoft's developer typeface and reads far
 * better than the Consolas/Courier default for long SQL listings. It falls
 * back to system fonts, so nothing is downloaded.
 */
const fontFamilyMonospace = "'Cascadia Code', 'Cascadia Mono', Consolas, 'SF Mono', Menlo, 'Liberation Mono', monospace";

export const lightTheme: Theme = { ...webLightTheme, fontFamilyMonospace };
export const darkTheme: Theme = { ...webDarkTheme, fontFamilyMonospace };
