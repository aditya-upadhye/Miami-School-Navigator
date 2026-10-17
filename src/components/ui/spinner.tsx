import * as React from "react"
import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"
import { useChrome } from "@/lib/i18n"

function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof Loader2Icon>) {
  const t = useChrome()
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={t("kit.spinner.loading")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
