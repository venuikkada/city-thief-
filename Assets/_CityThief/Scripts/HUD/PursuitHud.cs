using UnityEngine;
using UnityEngine.UI;
using CityThief.Police;

namespace CityThief.HUD
{
    // Shows the chase status at the top of the screen and big messages
    // in the middle ("COPS ARE COMING!", "YOU LOST THE POLICE", "BUSTED!").
    // Step 4 replaces the status line with the 5 wanted stars.
    public class PursuitHud : MonoBehaviour
    {
        [SerializeField] Text statusText;
        [SerializeField] Text bigText;

        PoliceDispatch dispatch;
        float bigTimer;

        void Start()
        {
            dispatch = PoliceDispatch.Instance;
            if (dispatch != null)
            {
                dispatch.PursuitStarted += OnStarted;
                dispatch.PursuitEnded += OnEnded;
                dispatch.PlayerBusted += OnBusted;
            }
            if (bigText != null) bigText.enabled = false;
        }

        void OnDestroy()
        {
            if (dispatch == null) return;
            dispatch.PursuitStarted -= OnStarted;
            dispatch.PursuitEnded -= OnEnded;
            dispatch.PlayerBusted -= OnBusted;
        }

        void Update()
        {
            if (statusText != null)
            {
                if (dispatch != null && dispatch.PursuitActive)
                {
                    if (dispatch.TimeSinceSeen < 1f)
                    {
                        statusText.text = "POLICE CHASE - sprint and break their line of sight!";
                        statusText.color = new Color(1f, 0.35f, 0.3f);
                    }
                    else
                    {
                        int left = Mathf.CeilToInt(dispatch.LoseTime - dispatch.TimeSinceSeen);
                        statusText.text = $"OUT OF SIGHT - stay hidden {left}s";
                        statusText.color = new Color(1f, 0.85f, 0.2f);
                    }
                }
                else
                {
                    statusText.text = "";
                }
            }

            if (bigText != null && bigTimer > 0f)
            {
                bigTimer -= Time.deltaTime;
                if (bigTimer <= 0f) bigText.enabled = false;
            }
        }

        void OnStarted() => ShowBig("COPS ARE COMING!", new Color(1f, 0.25f, 0.2f), 2f);

        void OnEnded(bool escaped)
        {
            if (escaped) ShowBig("YOU LOST THE POLICE", new Color(0.3f, 1f, 0.4f), 2.5f);
        }

        void OnBusted() => ShowBig("BUSTED!", new Color(1f, 0.15f, 0.15f), 2.5f);

        void ShowBig(string message, Color color, float seconds)
        {
            if (bigText == null) return;
            bigText.text = message;
            bigText.color = color;
            bigText.enabled = true;
            bigTimer = seconds;
        }
    }
}
