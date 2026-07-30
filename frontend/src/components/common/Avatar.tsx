import { getInitials } from '@/lib/utils';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

export function Avatar({ name, size = 'md', style }: AvatarProps) {
  return (
    <div className={`avatar avatar-${size}`} title={name} style={style}>
      {getInitials(name)}
    </div>
  );
}
