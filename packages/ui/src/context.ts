import type { Kernel } from '@kabel/core';
import { createContext } from 'preact';
import type { IconConfig } from './icons/config';

export const KernelContext = createContext<Kernel | null>(null);

export interface UiConfig {
  icons: IconConfig;
}

export const UiConfigContext = createContext<UiConfig>({ icons: {} });
