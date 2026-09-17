/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* Todos los colores base ahora leen de variables CSS (definidas en
           index.css) — así el modo claro/oscuro cambia sin tocar ningún
           componente: solo cambia qué valores tienen esas variables. El
           patrón "rgb(var(--x) / <alpha-value>)" preserva los modificadores
           de opacidad que ya se usan en toda la app (ej. bg-primary/10). */
        bg         : 'rgb(var(--color-bg) / <alpha-value>)',
        'bg-grid'  : '#0D0F13',
        surface    : 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--color-surface-3) / <alpha-value>)',
        border     : 'rgb(var(--color-border-rgb) / 0.07)',
        'border-2' : 'rgb(var(--color-border-rgb) / 0.12)',
        primary    : {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          dark   : 'rgb(var(--color-primary-dark) / <alpha-value>)',
          light  : 'rgb(var(--color-primary-light) / <alpha-value>)',
          glow   : 'rgba(224,177,43,0.25)',
        },
        accent     : {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          dark   : 'rgb(var(--color-accent-dark) / <alpha-value>)',
          light  : 'rgb(var(--color-accent-light) / <alpha-value>)',
          glow   : 'rgba(201,162,39,0.25)',
        },
        success    : {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          light  : 'rgb(var(--color-success-light) / <alpha-value>)',
          glow   : 'rgba(57,211,140,0.2)',
        },
        warning    : {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          light  : 'rgb(var(--color-warning-light) / <alpha-value>)',
        },
        danger     : {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          light  : 'rgb(var(--color-danger-light) / <alpha-value>)',
          glow   : 'rgba(217,112,94,0.2)',
        },
        sidebar    : {
          DEFAULT: 'rgb(var(--color-sidebar) / <alpha-value>)',
          2      : 'rgb(var(--color-sidebar-2) / <alpha-value>)',
          3      : 'rgb(var(--color-sidebar-3) / <alpha-value>)',
        },
        /* Plano propio para la barra superior del panel: con `surface` a secas
           se fundía con el fondo en modo oscuro (#42). */
        topbar     : {
          DEFAULT: 'rgb(var(--color-topbar) / <alpha-value>)',
          line   : 'rgb(var(--color-topbar-line) / var(--topbar-line-alpha))',
        },
        'text-1'   : 'rgb(var(--color-text-1) / <alpha-value>)',
        'text-2'   : 'rgb(var(--color-text-2) / <alpha-value>)',
        'text-3'   : 'rgb(var(--color-text-3) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgba(255,255,255,0.03)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e\")",
        'gradient-primary': 'linear-gradient(135deg, #C9A227, #E0B12B 55%, #F2D66B)',
        'gradient-dark'   : 'linear-gradient(135deg, #0D0F13, #1E232C)',
        'gradient-glow'   : 'radial-gradient(ellipse at top, rgba(224,177,43,0.16) 0%, transparent 60%)',
      },
      boxShadow: {
        card       : 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        glow       : '0 0 30px rgba(224,177,43,0.30)',
        'glow-sm'  : '0 0 15px rgba(224,177,43,0.20)',
        'glow-accent': '0 0 30px rgba(201,162,39,0.30)',
        inner      : 'var(--shadow-inner)',
      },
      animation: {
        'fade-up'    : 'fadeUp 0.4s ease both',
        'fade-in'    : 'fadeIn 0.3s ease both',
        'slide-in'   : 'slideIn 0.3s ease both',
        'scale-in'   : 'scaleIn 0.2s ease both',
        'toast-in'   : 'toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        'toast-out'  : 'toastOut 0.25s ease forwards',
        'pulse-soft' : 'pulseSoft 2s ease-in-out infinite',
        'float'      : 'float 3s ease-in-out infinite',
        'shimmer'    : 'shimmer 1.5s linear infinite',
        'marquee'    : 'marquee 35s linear infinite',
        'marquee-slow': 'marquee 60s linear infinite',
        'slide-in-right': 'slideInRight 0.55s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-left' : 'slideInLeft 0.55s cubic-bezier(0.16,1,0.3,1) both',
        'auth-card-in'  : 'authCardIn 0.7s cubic-bezier(0.16,1,0.3,1) both',
        'spin-slow'  : 'spin 12s linear infinite',
        'glow-pulse' : 'glowPulse 4s ease-in-out infinite',
        'logo-shine' : 'logoShine 6s ease-in-out infinite',
        'wheel-spin' : 'wheelSpin 0.9s cubic-bezier(0.6,-0.05,0.2,1.05) both',
        'auth-out-right': 'authOutRight 0.45s cubic-bezier(0.5,0,0.75,0) both',
        'auth-out-left' : 'authOutLeft 0.45s cubic-bezier(0.5,0,0.75,0) both',
        'auth-in-right' : 'authInRight 0.55s cubic-bezier(0.25,1,0.5,1) both',
        'auth-in-left'  : 'authInLeft 0.55s cubic-bezier(0.25,1,0.5,1) both',
      },
      keyframes: {
        fadeUp    : { from:{ opacity:0, transform:'translateY(10px)' }, to:{ opacity:1, transform:'translateY(0)' } },
        /* Pasos del registro por módulos. Doce píxeles, no sesenta: aquí el
           desplazamiento no es un efecto, es la respuesta a «¿avancé o
           retrocedí?». Si se nota como animación, ya es demasiado —son catorce
           pasos seguidos y lo van a hacer miles de personas. */
        pasoAdelante: { from:{ opacity:0, transform:'translateX(12px)' },  to:{ opacity:1, transform:'translateX(0)' } },
        pasoAtras   : { from:{ opacity:0, transform:'translateX(-12px)' }, to:{ opacity:1, transform:'translateX(0)' } },
        fadeIn    : { from:{ opacity:0 }, to:{ opacity:1 } },
        slideIn   : { from:{ opacity:0, transform:'translateX(-10px)' }, to:{ opacity:1, transform:'translateX(0)' } },
        scaleIn   : { from:{ opacity:0, transform:'scale(0.95)' }, to:{ opacity:1, transform:'scale(1)' } },
        toastIn   : { from:{ opacity:0, transform:'translateX(120%)' }, to:{ opacity:1, transform:'translateX(0)' } },
        toastOut  : { from:{ opacity:1, transform:'translateX(0)' }, to:{ opacity:0, transform:'translateX(120%)' } },
        pulseSoft : { '0%,100%':{ opacity:.6 }, '50%':{ opacity:1 } },
        float     : { '0%,100%':{ transform:'translateY(0)' }, '50%':{ transform:'translateY(-6px)' } },
        shimmer   : { from:{ backgroundPosition:'-200% 0' }, to:{ backgroundPosition:'200% 0' } },
        marquee   : { from:{ transform:'translateX(0)' }, to:{ transform:'translateX(-50%)' } },
        slideInRight: { from:{ opacity:0, transform:'translateX(60px)' }, to:{ opacity:1, transform:'translateX(0)' } },
        slideInLeft : { from:{ opacity:0, transform:'translateX(-60px)' }, to:{ opacity:1, transform:'translateX(0)' } },
        authCardIn  : { '0%':{ opacity:0, transform:'translateY(20px) scale(0.97)' }, '60%':{ opacity:1 }, '100%':{ opacity:1, transform:'translateY(0) scale(1)' } },
        wheelSpin   : { '0%':{ transform:'rotate(0deg) scale(1)' }, '50%':{ transform:'rotate(180deg) scale(1.1)' }, '100%':{ transform:'rotate(360deg) scale(1)' } },
        authOutRight: { from:{ opacity:1, transform:'translateX(0)' }, to:{ opacity:0, transform:'translateX(50%)' } },
        authOutLeft : { from:{ opacity:1, transform:'translateX(0)' }, to:{ opacity:0, transform:'translateX(-50%)' } },
        authInRight : { from:{ opacity:0, transform:'translateX(-50%)' }, to:{ opacity:1, transform:'translateX(0)' } },
        authInLeft  : { from:{ opacity:0, transform:'translateX(50%)' }, to:{ opacity:1, transform:'translateX(0)' } },
        glowPulse : { '0%,100%':{ opacity:.35, transform:'scale(1)' }, '50%':{ opacity:.7, transform:'scale(1.08)' } },
        logoShine : { '0%,100%':{ filter:'drop-shadow(0 0 0 rgba(224,177,43,0))' }, '50%':{ filter:'drop-shadow(0 0 14px rgba(224,177,43,0.55))' } },
      },
      backdropBlur: { xs: '2px' },
      borderRadius: { '2xl':'1rem', '3xl':'1.5rem', '4xl':'2rem' },
      transitionTimingFunction: { spring: 'cubic-bezier(0.34,1.56,0.64,1)' },
    },
  },
  plugins: [],
};
