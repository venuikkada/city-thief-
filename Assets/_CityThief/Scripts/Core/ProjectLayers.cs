namespace CityThief.Core
{
    // Physics layers used by the game. The scene builders create these layers
    // automatically (Edit > Project Settings > Tags and Layers).
    public static class ProjectLayers
    {
        public const int Default = 0;   // ground, roads, buildings
        public const int Player = 8;
        public const int Vehicle = 9;   // traffic cars, police cars
        public const int NPC = 10;      // pedestrians, police officers

        // What blocks the camera: only the world, never people or cars
        // (passing cars would make the camera jump).
        public const int CameraCollisionMask = 1 << Default;

        // What blocks police eyes (line of sight).
        public const int SightBlockMask = 1 << Default;

        // What a car brakes for.
        public const int TrafficObstacleMask = (1 << Player) | (1 << Vehicle) | (1 << NPC);

        // What a person walking must go around.
        public const int WalkerObstacleMask = (1 << Default) | (1 << Vehicle);
    }
}
