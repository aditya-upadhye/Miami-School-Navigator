import { motion } from 'motion/react';
import { Sparkles, Clock, Rocket } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ModuleComingSoonProps {
  /**
   * Module name to display
   * @example "Analytics Dashboard"
   */
  moduleName?: string;
  
  /**
   * Optional description
   */
  description?: string;
  
  /**
   * Show animated skeleton preview
   * @default true
   */
  showSkeleton?: boolean;
}

/**
 * Modern "Coming Soon" component for modules under development
 * 
 * Features:
 * - Animated entrance with motion (motion/react)
 * - Skeleton loading preview
 * - Gradient accents
 * - Responsive design
 * - Glass morphism effect
 * 
 * @example
 * <ModuleComingSoon 
 *   moduleName="Analytics Dashboard" 
 *   description="Advanced metrics and insights"
 * />
 */
export function ModuleComingSoon({
  moduleName = 'Module',
  description,
  showSkeleton = true,
}: ModuleComingSoonProps) {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl"
      >
        <Card className="relative overflow-hidden border-2 border-dashed border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 backdrop-blur-sm">
          {/* Animated gradient background */}
          <motion.div
            animate={{
              backgroundPosition: ['0% 0%', '100% 100%'],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
            className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 bg-[length:200%_200%]"
          />

          <div className="relative p-8 md:p-12 space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
              <motion.div
                animate={{
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="inline-block"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                  <div className="relative bg-primary/10 p-6 rounded-full">
                    <Sparkles className="w-12 h-12 text-primary" />
                  </div>
                </div>
              </motion.div>

              <div className="space-y-2">
                <Badge variant="secondary" className="gap-1.5">
                  <Clock className="w-3 h-3" />
                  Under Development
                </Badge>
                
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent"
                >
                  {moduleName}
                </motion.h2>
                
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-lg text-muted-foreground max-w-md mx-auto"
                >
                  This module is not yet available
                </motion.p>

                {description && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-sm text-muted-foreground max-w-lg mx-auto pt-2"
                  >
                    {description}
                  </motion.p>
                )}
              </div>
            </div>

            {/* Skeleton Preview */}
            {showSkeleton && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                    >
                      <Card className="p-6 space-y-3 bg-card/50 backdrop-blur-sm">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <Card className="p-6 space-y-4 bg-card/50 backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-4/6" />
                  </div>
                </Card>
              </motion.div>
            )}

            {/* Footer Message */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-center pt-4"
            >
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-full backdrop-blur-sm">
                <Rocket className="w-4 h-4" />
                <span>We're working hard to bring this to you soon</span>
              </div>
            </motion.div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

