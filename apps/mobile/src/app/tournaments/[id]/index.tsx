import { useLocalSearchParams } from 'expo-router';
import { TournamentDetailScreen } from '../../index';

export default function TournamentDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <TournamentDetailScreen tournamentId={typeof id === 'string' ? id : undefined} />;
}
