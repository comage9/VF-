import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

export interface KPICard {
    title: string;
    value: string | ReactNode;
    subtitle?: string;
    icon: LucideIcon;
    priority: 'high' | 'medium' | 'low';
    colorTheme?: 'blue' | 'emerald' | 'gray' | 'amber' | 'red';
}

const colorStyles = {
    blue: {
        card: 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200',
        title: 'text-blue-700',
        value: 'text-blue-900',
        subtitle: 'text-blue-700',
        icon: 'text-blue-600 bg-white'
    },
    emerald: {
        card: 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200',
        title: 'text-emerald-700',
        value: 'text-emerald-900',
        subtitle: 'text-emerald-700',
        icon: 'text-emerald-600 bg-white'
    },
    gray: {
        card: 'bg-gray-50 border border-gray-200',
        title: 'text-gray-600',
        value: 'text-gray-900',
        subtitle: 'text-gray-500',
        icon: 'text-gray-500 bg-white'
    },
    amber: {
        card: 'bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200',
        title: 'text-amber-700',
        value: 'text-amber-900',
        subtitle: 'text-amber-700',
        icon: 'text-amber-600 bg-white'
    },
    red: {
        card: 'bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200',
        title: 'text-red-700',
        value: 'text-red-900',
        subtitle: 'text-red-700',
        icon: 'text-red-600 bg-white'
    }
};

interface KPICardsProps {
    cards: KPICard[];
    layout?: 'grid-2x2' | 'flex-row';
}

export default function KPICards({ cards, layout = 'grid-2x2' }: KPICardsProps) {
    const containerClass = layout === 'grid-2x2'
        ? 'grid grid-cols-2 md:grid-cols-4 gap-3'
        : 'flex flex-wrap gap-3';

    return (
        <div className={containerClass}>
            {cards.map((card, index) => {
                const Icon = card.icon;
                const theme = card.colorTheme || (card.priority === 'high' ? 'blue' : 'gray');
                const styles = colorStyles[theme];

                return (
                    <Card key={index} className={styles.card}>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className={`text-xs font-medium uppercase ${styles.title}`}>{card.title}</p>
                                    <h3 className={`text-xl font-bold ${styles.value}`}>{card.value}</h3>
                                    {card.subtitle && <p className={`text-xs mt-1 ${styles.subtitle}`}>{card.subtitle}</p>}
                                </div>
                                <Icon className={`w-8 h-8 ${styles.icon} rounded-full p-1.5`} />
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
