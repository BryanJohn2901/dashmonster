import { SettingsNav } from '@/components/settings/SettingsNav'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6">
      <div className="flex min-h-full gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-0">
            <SettingsNav />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
