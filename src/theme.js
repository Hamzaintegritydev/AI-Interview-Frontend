// src/theme.js
import { createSystem, defineConfig, defaultBaseConfig } from '@chakra-ui/react';

const config = defineConfig({
  theme: {
    colors: {
      brand: {
        500: '#3182ce', // Example color
      },
    },
  },
});

export const theme = createSystem(defaultBaseConfig, config);
