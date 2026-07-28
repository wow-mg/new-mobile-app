import { useLocalSearchParams } from 'expo-router';
import { TournamentApplicationScreen } from '../../index';

export default function TournamentApplicationRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <TournamentApplicationScreen tournamentId={typeof id === 'string' ? id : undefined} />;
}
