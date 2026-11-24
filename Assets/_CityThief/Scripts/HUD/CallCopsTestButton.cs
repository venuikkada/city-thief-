using UnityEngine;
using CityThief.Controls;
using CityThief.Police;

namespace CityThief.HUD
{
    // TEST ONLY (Step 2): a button that starts a police chase.
    // Step 4 removes it - crimes and shooting will start chases instead.
    public class CallCopsTestButton : MonoBehaviour
    {
        [SerializeField] TouchButton button;

        void OnEnable()
        {
            if (button != null) button.Pressed += CallCops;
        }

        void OnDisable()
        {
            if (button != null) button.Pressed -= CallCops;
        }

        void CallCops()
        {
            var dispatch = PoliceDispatch.Instance;
            if (dispatch != null) dispatch.StartPursuit();
        }
    }
}
