/**
 * Framer Motion Animation Utilities
 * 
 * Pre-configured animation variants for consistent micro-interactions
 * across the application.
 * 
 * Usage:
 * ```tsx
 * import { fadeIn, slideUp, staggerContainer } from '@/lib/animations';
 * 
 * <motion.div variants={fadeIn} initial="hidden" animate="visible">
 *   Content
 * </motion.div>
 * ```
 */

import type { Variants, Transition } from 'motion/react';

// ═══════════════════════════════════════════════════════════════════════════
// TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const defaultTransition: Transition = {
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1], // ease-out
};

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

export const fastTransition: Transition = {
  duration: 0.15,
  ease: 'easeOut',
};

export const smoothTransition: Transition = {
  type: 'tween',
  ease: [0.25, 0.1, 0.25, 1],
  duration: 0.4,
};

export const quickTransition: Transition = {
  type: 'tween',
  ease: 'easeOut',
  duration: 0.2,
};

// ═══════════════════════════════════════════════════════════════════════════
// FADE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: defaultTransition,
  },
  exit: { 
    opacity: 0,
    transition: fastTransition,
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: defaultTransition,
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: fastTransition,
  },
};

/**
 * fadeInUp — the most common golden-page variant (fade + slide up).
 * Alias kept because 100+ golden pages import this exact name.
 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 },
  },
};

export const successBounce: Variants = {
  hidden: { opacity: 0, scale: 0.3 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 15 },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: defaultTransition,
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: fastTransition,
  },
};

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: defaultTransition,
  },
  exit: { 
    opacity: 0, 
    y: 10,
    transition: fastTransition,
  },
};

export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: defaultTransition,
  },
  exit: { 
    opacity: 0, 
    x: -10,
    transition: fastTransition,
  },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: defaultTransition,
  },
  exit: { 
    opacity: 0, 
    x: 10,
    transition: fastTransition,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTAINER VARIANTS (for staggered children)
// ═══════════════════════════════════════════════════════════════════════════

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ITEM VARIANTS (for use with stagger containers)
// ═══════════════════════════════════════════════════════════════════════════

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: defaultTransition,
  },
};

export const staggerItemScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: springTransition,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HOVER VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

export const hoverScale = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: quickTransition,
};

export const hoverScaleLarge = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.95 },
  transition: fastTransition,
};

export const hoverLift = {
  whileHover: { y: -4, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' },
  transition: smoothTransition,
};

// ═══════════════════════════════════════════════════════════════════════════
// TAP VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

export const tapScale = {
  scale: 0.98,
};

export const tapScaleSmall = {
  scale: 0.95,
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const pageTransition: Variants = {
  hidden: { 
    opacity: 0,
  },
  visible: { 
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: { 
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: 'easeIn',
    },
  },
};

export const pageSlideUp: Variants = {
  hidden: { 
    opacity: 0, 
    y: 20,
  },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON/LOADING
// ═══════════════════════════════════════════════════════════════════════════

export const shimmer: Variants = {
  hidden: { opacity: 0.5 },
  visible: { 
    opacity: 1,
    transition: {
      duration: 1,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION/TOAST
// ═══════════════════════════════════════════════════════════════════════════

export const notification: Variants = {
  hidden: { 
    opacity: 0, 
    y: -20, 
    scale: 0.95,
  },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: springTransition,
  },
  exit: { 
    opacity: 0, 
    y: -10, 
    scale: 0.95,
    transition: fastTransition,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MODAL/DIALOG
// ═══════════════════════════════════════════════════════════════════════════

export const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

export const modalContent: Variants = {
  hidden: { 
    opacity: 0, 
    scale: 0.95,
    y: 10,
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 30,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCORDION/COLLAPSE
// ═══════════════════════════════════════════════════════════════════════════

export const collapse: Variants = {
  hidden: { 
    height: 0, 
    opacity: 0,
    transition: {
      height: { duration: 0.2 },
      opacity: { duration: 0.1 },
    },
  },
  visible: { 
    height: 'auto', 
    opacity: 1,
    transition: {
      height: { duration: 0.3 },
      opacity: { duration: 0.2, delay: 0.1 },
    },
  },
};
