import {
  Button,
  Menu,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Tooltip,
  type MenuProps,
} from '@fluentui/react-components';
import { DesktopMac20Regular, WeatherMoon20Regular, WeatherSunny20Regular } from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { isThemePreference, type ThemePreference } from './themePreference';
import { useTheme } from './ThemeProvider';

const options: { value: ThemePreference; label: string; icon: ReactElement }[] = [
  { value: 'light', label: 'Light', icon: <WeatherSunny20Regular /> },
  { value: 'dark', label: 'Dark', icon: <WeatherMoon20Regular /> },
  { value: 'system', label: 'System', icon: <DesktopMac20Regular /> },
];

export function ThemeSwitcher() {
  const { preference, resolved, setPreference } = useTheme();

  const onCheckedValueChange: MenuProps['onCheckedValueChange'] = (_, data) => {
    const value = data.checkedItems[0];
    if (isThemePreference(value)) setPreference(value);
  };

  return (
    <Menu checkedValues={{ theme: [preference] }} onCheckedValueChange={onCheckedValueChange}>
      <MenuTrigger disableButtonEnhancement>
        <Tooltip content="Theme" relationship="label">
          <Button appearance="subtle" icon={resolved === 'dark' ? <WeatherMoon20Regular /> : <WeatherSunny20Regular />} />
        </Tooltip>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {options.map((option) => (
            <MenuItemRadio key={option.value} name="theme" value={option.value} icon={option.icon}>
              {option.label}
            </MenuItemRadio>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
